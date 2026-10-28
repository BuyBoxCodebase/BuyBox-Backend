import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { generateOTP } from '../../../libs/common/src';
import {
  JwtPayload,
  SellerActivationTokenPayload,
} from './jwt-payload.interface';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SellerAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly mailService: MailerService,
    private readonly configService: ConfigService,
  ) { }

  async uploadProfileImage(file: Array<Express.Multer.File>) {
    const images = await this.cloudinaryService.uploadImages(file);
    const urls = images.map((image) => {
      return {
        publicId: image.public_id,
        url: image.url,
      };
    });
    return urls;
  }

  private generateAccessToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '1d',
    });
  }

  private generateRefreshToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
  }

  // Signing with the current password hash makes a reset link single-use:
  // once the password changes, every outstanding link stops verifying.
  private resetSecret(passwordHash: string | null): string {
    return this.configService.get<string>('JWT_SECRET') + (passwordHash ?? '');
  }

  // Never send the password hash to the client.
  private withoutPassword<T extends { password?: string | null }>(user: T) {
    const { password, ...rest } = user;
    return rest;
  }

  async registerSeller(
    email: string,
    password: string,
    name: string,
    phoneNumber: string,
  ) {
    const hashedPassword = await argon2.hash(password);

    // Check if email already exists
    const userExists = await this.prisma.seller.findUnique({
      where: {
        email: email,
      },
    });
    if (userExists) {
      throw new UnauthorizedException('Email already in use');
    }

    const activationCode = generateOTP(6);
    console.log(activationCode);
    const payload: SellerActivationTokenPayload = {
      email,
      name,
      password: hashedPassword,
      code: activationCode,
      phoneNumber,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '10m' });

    await this.mailService.sendMail({
      email: email,
      subject: 'Email Verification Mail',
      mail_file: 'verification_mail.ejs',
      data: {
        otp: activationCode,
      },
    });

    return { activationToken: token };
  }

  async verifySeller(token: string, activationCode: string) {
    try {
      const decoded: SellerActivationTokenPayload =
        this.jwtService.verify(token);

      if (decoded.code !== activationCode) {
        throw new BadRequestException('Invalid activation code');
      }

      // Create user after successful code verification
      const user = await this.prisma.seller.create({
        data: {
          name: decoded.name,
          email: decoded.email,
          password: decoded.password,
          phoneNumber: decoded.phoneNumber,
          isCompleted: false,
        },
      });
      const payload: JwtPayload = {
        email: user.email,
        sub: user.id,
        role: 'SELLER',
      };
      const accessToken = this.generateAccessToken(payload)
      const refreshToken = this.generateRefreshToken(payload);

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isCompleted: user.isCompleted,
          profilePic: user.profilePic,
          username: user.email,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async loginSeller(email: string, password: string) {
    const user = await this.prisma.seller.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Social-signup accounts have no password; argon2.verify would throw on null.
    if (!user.password) {
      throw new UnauthorizedException('This account was created with Google Sign-In. Continue with Google, or use "Forgot password?" to set a password.');
    }

    if (!(await argon2.verify(user.password, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      role: 'SELLER',
    };
    const accessToken = this.generateAccessToken(payload)
    const refreshToken = this.generateRefreshToken(payload);

    return { user: this.withoutPassword(user), accessToken, refreshToken };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.seller.findUnique({ where: { email } });

    // Google-only accounts land here too, which is how they get a first password.
    if (user) {
      const token = this.jwtService.sign(
        { sub: user.id, purpose: 'seller-password-reset' },
        { secret: this.resetSecret(user.password), expiresIn: '30m' },
      );
      const frontendUrl = process.env.SELLER_FRONTEND_URL || 'https://sell.treides.com';

      await this.mailService.sendMail({
        email: user.email,
        subject: 'Reset your password',
        mail_file: 'password_reset_mail.ejs',
        data: {
          name: user.name,
          // The seller site's /forgot-password page shows the reset form when it has a token.
          resetUrl: `${frontendUrl}/forgot-password?token=${token}`,
        },
      });
    }

    // Same answer either way so this can't be used to find out who has an account.
    return { message: 'If an account exists for that email, we have sent a link to reset the password.' };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const invalidLink = new BadRequestException('This reset link is invalid or has expired. Please request a new one.');

    // Read the user id first: the signing secret depends on that user's current hash.
    const decoded = this.jwtService.decode(token) as { sub?: string } | null;
    if (!decoded?.sub) throw invalidLink;

    const user = await this.prisma.seller.findUnique({ where: { id: decoded.sub } });
    if (!user) throw invalidLink;

    try {
      const payload = this.jwtService.verify(token, { secret: this.resetSecret(user.password) });
      if (payload.purpose !== 'seller-password-reset') throw invalidLink;
    } catch {
      throw invalidLink;
    }

    await this.prisma.seller.update({
      where: { id: user.id },
      data: { password: await argon2.hash(newPassword) },
    });

    return { message: 'Your password has been updated. You can now log in.' };
  }

  async sellerGoogleLogin(profile: any) {
    const user = await this.prisma.seller.upsert({
      where: { email: profile.emails[0].value },
      update: {
        name: profile.displayName,
        profilePic: profile.photos[0].value,
      },
      create: {
        email: profile.emails[0].value,
        googleId: profile.id,
        name: profile.displayName,
        profilePic: profile.photos[0].value,
        isCompleted: false,
      },
    });

    const payload: JwtPayload = {
      email: user.email,
      sub: user.id,
      role: 'SELLER',
    };
    const accessToken = this.generateAccessToken(payload)
    const refreshToken = this.generateRefreshToken(payload);

    return {
      user: this.withoutPassword(user),
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(user: any) {
    try {
      const payload: JwtPayload = {
        email: user.email,
        sub: user.userId,
        role: 'SELLER',
      };

      const accessToken = this.generateAccessToken(payload)
      const refreshToken = this.generateRefreshToken(payload);

      return { accessToken, refreshToken };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

}

