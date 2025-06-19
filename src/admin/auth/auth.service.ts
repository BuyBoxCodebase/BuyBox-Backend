import { Injectable } from '@nestjs/common';
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
        const user = await this.prisma.admin.upsert({
            where: { email: profile.emails[0].value },
            update: { name: profile.displayName, profilePic: profile.photos[0].value },
            create: {
                email: profile.emails[0].value,
                googleId: profile.id,
                name: profile.displayName,
                profilePic: profile.photos[0].value,
            },
        });

        const payload: JwtPayload = { email: user.email, sub: user.id, role: user.role };
        const token = this.jwtService.sign(payload);

        return {
            user,
            token,
        };
    }

    async logout(req: any) {
        req.session.destroy();
        return { message: 'Logged out successfully' };
    }
}