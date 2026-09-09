import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CustomerProfileService {
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

    async getCustomerDetails(userId: string) {
        const customer = await this.prisma.customer.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                name: true,
                email: true,
                profilePic: true,
                username: true,
                isCompleted: true,
                preferences: true,
            }
        });

        if (!customer) {
            return {
                success: false,
                message: "Failed to fetch"
            };
        }

        return {
            success: true,
            message: "Customer fetched",
            customer
        }
    }

    async updateCustomerDetails(userId: string, data: { name?: string, username?: string, phoneNumber?: string; profilePic?: string; preferences?: any }) {
        const updateData: any = { isCompleted: true };
        if (data.name !== undefined) updateData.name = data.name;
        if (data.username !== undefined) updateData.username = data.username;
        if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
        if (data.profilePic !== undefined) updateData.profilePic = data.profilePic;
        if (data.preferences !== undefined) updateData.preferences = data.preferences;

        const updatedCustomer = await this.prisma.customer.update({
            where: { id: userId },
            data: updateData
        });

        if (data.preferences?.goal) {
            let segmentId = 3; // casual fallback
            if (data.preferences.goal === "Finding the best deals") segmentId = 1;
            else if (data.preferences.goal === "Discovering new trends") segmentId = 2;

            await this.prisma.userSegment.upsert({
                where: { userId },
                create: { userId, segmentId },
                update: { segmentId }
            });
        }

        return {
            success: true,
            message: "Update Customer details",
            userId: updatedCustomer.id
        }
    }

    async setCustomerOrderPreference() { }
}
