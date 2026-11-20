import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtPayload } from 'src/customer/auth/jwt-payload.interface';

@Injectable()
export class AdminAuthService {
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

    async googleLogin(profile: any) {
        // find + update/create instead of upsert: this MongoDB deployment doesn't support the transaction upsert needs
        const email = profile.emails[0].value;
        const existing = await this.prisma.admin.findUnique({ where: { email } });
        const user = existing
            ? await this.prisma.admin.update({
                where: { email },
                data: { name: profile.displayName, profilePic: profile.photos[0].value },
            })
            : await this.prisma.admin.create({
                data: {
                    email,
                    googleId: profile.id,
                    name: profile.displayName,
                    profilePic: profile.photos[0].value,
                },
            });

        const payload: JwtPayload = { email: user.email, sub: user.id, role: user.role };
        const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
        const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

        return {
            user,
            accessToken,
            refreshToken,
        };
    }

    async refreshToken(token: string) {
        try {
            const decoded = this.jwtService.verify(token);
            const payload: JwtPayload = {
                email: decoded.email,
                sub: decoded.sub,
                role: decoded.role
            };
            
            const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
            const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

            return { accessToken, refreshToken };
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired refresh token');
        }
    }
}