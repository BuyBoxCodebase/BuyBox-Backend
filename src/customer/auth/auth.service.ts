import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { CustomerActivationTokenPayload, JwtPayload } from './jwt-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuth2Client } from 'google-auth-library';
import { generateOTP } from '../../../libs/common/src/generateOTP';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { MailerService } from '../../mailer/mailer.service';

@Injectable()
export class CustomerAuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private readonly cloudinaryService: CloudinaryService,
        private readonly mailService: MailerService,
    ) { }

    async registerCustomer(email: string, password: string, name: string, phoneNumber: string) {
        const hashedPassword = await argon2.hash(password);

        // Check if email already exists
        const userExists = await this.prisma.customer.findUnique({
            where: {
                email: email,
            }
        });
        if (userExists) {
            throw new UnauthorizedException('Email already in use');
        }
        const activationCode = generateOTP(6);
        console.log(activationCode);
        const payload: CustomerActivationTokenPayload = { email, name, password: hashedPassword, phoneNumber, code: activationCode };
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

    async verifyCustomer(token: string, activationCode: string) {
        try {
            // Validate JWT token
            const decoded: CustomerActivationTokenPayload = this.jwtService.verify(token);

            // Check if the code in the token matches the provided activation code
            if (decoded.code !== activationCode) {
                throw new BadRequestException('Invalid activation code');
            }

            // Create user after successful code verification
            const user = await this.prisma.customer.create({
                data: {
                    name: decoded.name,
                    email: decoded.email,
                    password: decoded.password,
                    phoneNumber: decoded.phoneNumber,
                },
            });
            const payload: JwtPayload = { email: user.email, sub: user.id, role: "CUSTOMER" };
            const accessToken = this.jwtService.sign(payload);

            return { user, accessToken };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    async loginCustomer(email: string, password: string) {
        const user = await this.prisma.customer.findUnique({
            where: { email },
        });

        if (!user || !(await argon2.verify(user.password, password))) {
            throw new UnauthorizedException('Invalid credentials');
        }

        const payload: JwtPayload = { email: user.email, sub: user.id, role: "CUSTOMER" };
        const accessToken = this.jwtService.sign(payload);

        return { user, accessToken };
    }

    async customerGoogleLogin(profile: any) {
        const user = await this.prisma.customer.upsert({
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

        return {
            user,
            userId: user.id,
            email: user.email,
            role: "CUSTOMER",
            profilePic: user.profilePic,
            isCompleted: user.isCompleted,
        };
    }

    async facebookLogin(profile: any) {
        const user = await this.prisma.customer.upsert({
            where: { email: profile.emails[0].value },
            update: { name: profile.displayName, profilePic: profile.photos[0].value },
            create: {
                email: profile.emails[0].value,
                name: profile.displayName,
                facebookId: profile.id,
                profilePic: profile.photos[0].value,
            },
        });

        const payload: JwtPayload = { email: user.email, sub: user.id, role: "CUSTOMER" };
        const token = this.jwtService.sign(payload);

        return { user, token };
    }

    async verifyGoogleIdToken(idToken: string) {
        console.log('IDToken:', idToken);
        const ticket = await new OAuth2Client(process.env.GOOGLE_CLIENT_MOBILE_ID).verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_MOBILE_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
            throw new UnauthorizedException('Invalid Google token');
        }

        return this.customerGoogleLogin({
            id: payload.sub,
            emails: [{ value: payload.email }],
            photos: [{ value: payload.picture }],
            displayName: payload.name,
        });
    }
    async logoutCustomer(req: any) {
        req.session.destroy();
        return { message: 'Customer Logged out successfully' };
    }
}
