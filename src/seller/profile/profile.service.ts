import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class SellerProfileService {
    constructor(
        private prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    async getSellerDetails(userId: string) {
        const seller = await this.prisma.seller.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                name: true,
                email: true,
                isCompleted: true,
                profilePic: true,
                username: true,
            }
        });

        if (!seller) {
            return {
                success: false,
                message: "Failed to fetch"
            };
        }

        return {
            success: true,
            message: "Seller fetched",
            seller
        }
    }

    async updateSellerDetails(userId: string, data: { name: string, username: string }) {
        const updatedSeller = await this.prisma.seller.update({
            where: {
                id: userId
            },
            data: {
                name: data.name,
                username: data.username
            }
        });

        return {
            success: true,
            message: "Update seller details",
            userId: updatedSeller.id
        }
    }
}
