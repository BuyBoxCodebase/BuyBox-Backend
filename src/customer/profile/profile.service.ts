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

    async setCustomerOrderPreference() { }
}
