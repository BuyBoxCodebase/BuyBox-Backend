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
                interests: true,
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

    async updateCustomerDetails(userId: string, data: { name: string, username: string, phoneNumber: string; profilePic: string; }) {
        const updatedCustomer = await this.prisma.customer.update({
            where: {
                id: userId
            },
            data: {
                name: data.name,
                username: data.username,
                phoneNumber: data.phoneNumber,
                profilePic: data.profilePic,
                isCompleted: true,
            }
        });

        return {
            success: true,
            message: "Update Customer details",
            userId: updatedCustomer.id
        }
    }

    async updateInterests(userId: string, categoryIds: string[]) {
        if (!Array.isArray(categoryIds)) {
            return { success: false, message: "categoryIds must be an array" };
        }

        // only persist ids that map to a real category, so interests always
        // stay joinable against Category and ad targeting keeps matching
        const valid = await this.prisma.category.findMany({
            where: { id: { in: categoryIds } },
            select: { id: true },
        });
        const interests = valid.map((c) => c.id);

        if (interests.length === 0) {
            return { success: false, message: "No valid categories provided" };
        }

        await this.prisma.customer.update({
            where: { id: userId },
            data: { interests },
        });

        return {
            success: true,
            message: "Interests updated",
            interests,
        };
    }

    async setCustomerOrderPreference() { }
}
