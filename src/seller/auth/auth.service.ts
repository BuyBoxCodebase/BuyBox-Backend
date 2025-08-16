import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { generateOTP } from '@app/common';
import { JwtPayload, SellerActivationTokenPayload } from './jwt-payload.interface';

@Injectable()
export class SellerAuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private readonly cloudinaryService: CloudinaryService,
        private readonly mailService: MailerService,
    ) { }

    async uploadProfileImage(file: Array<Express.Multer.File>) {
        const images = (await this.cloudinaryService.uploadImages(file));
        const urls = images.map((image) => {
            return {
                publicId: image.public_id,
                url: image.url,
            };
        });
        return urls;
    }

    async registerSeller(email: string, password: string, name: string, phoneNumber: string) {
        const hashedPassword = await argon2.hash(password);

        // Check if email already exists
        const userExists = await this.prisma.seller.findUnique({
            where: {
                email: email,
            }
        });
        if (userExists) {
            throw new UnauthorizedException('Email already in use');
        }

        const activationCode = generateOTP(6);
        console.log(activationCode);
        const payload: SellerActivationTokenPayload = { email, name, password: hashedPassword, code: activationCode, phoneNumber };
        const token = this.jwtService.sign(payload, { expiresIn: '10m' });

        await this.mailService.sendMail({
            email: email,
            subject: "Email Verification Mail",
            mail_file: 'verification_mail.ejs',
            data: {
                otp: activationCode
            }
        });

        return { activationToken: token };
    }

    async verifySeller(token: string, activationCode: string) {
        try {
            const decoded: SellerActivationTokenPayload = this.jwtService.verify(token);

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
            const payload: JwtPayload = { email: user.email, sub: user.id, role: "SELLER" };
            const accessToken = this.jwtService.sign(payload);

            return {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    isCompleted: user.isCompleted,
                    profilePic: user.profilePic,
                    username: user.email,
                },
                accessToken
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    async loginSeller(email: string, password: string) {
        const user = await this.prisma.seller.findUnique({
            where: { email },
        });

        if (!user || !(await argon2.verify(user.password, password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload: JwtPayload = { email: user.email, sub: user.id, role: "SELLER" };
        const accessToken = this.jwtService.sign(payload);

        return { user, accessToken };
    }

    async sellerGoogleLogin(profile: any) {
        const user = await this.prisma.seller.upsert({
            where: { email: profile.emails[0].value },
            update: { name: profile.displayName, profilePic: profile.photos[0].value },
            create: {
                email: profile.emails[0].value,
                googleId: profile.id,
                name: profile.displayName,
                profilePic: profile.photos[0].value,
                isCompleted: false,
            },
        });

        const payload: JwtPayload = { email: user.email, sub: user.id, role: "SELLER" };
        const token = this.jwtService.sign(payload);

        return {
            user,
            token,
        };
    }
}
