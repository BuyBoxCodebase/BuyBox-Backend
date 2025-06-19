import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminProfileService {
    constructor(
        private prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
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

    async getProfile(userId: string) {
        const admin = await this.prisma.admin.findUnique({
            where: {
                id: userId
            },
            omit: {
                password: true,
                googleId: true,
                facebookId: true,
                updatedAt: true,
            }
        });
        return admin;
    }

    async updateProfile(userId: string, { name, profilePic }: { name: string; profilePic: string; }) {
        const updatedProfile = await this.prisma.admin.update({
            where: {
                id: userId,
            },
            data: {
                name,
                profilePic,
            }
        });

        return updatedProfile;
    }

}
