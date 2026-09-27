import { BadRequestException, Injectable } from '@nestjs/common';
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

    async completeProfile(userId: string, data: {
        name: string;
        description: string;
        brandPic?: string;
        location: string;
    }) {
        const existingSeller = await this.prisma.seller.findUnique({
            where: { id: userId }
        });

        if (!existingSeller) {
            throw new BadRequestException('Seller not found');
        }

        if (existingSeller.isCompleted) {
            throw new BadRequestException('Profile is already completed. Use update instead.');
        }

        const updatedSeller = await this.prisma.seller.update({
            where: { id: userId },
            data: {
                name: data.name,
                description: data.description,
                brandPic: data.brandPic,
                location: data.location,
                isCompleted: true,
            }
        });

        return {
            success: true,
            message: 'Profile completed successfully',
            sellerId: updatedSeller.id,
        };
    }

    async getMyProfile(userId: string) {
        const seller = await this.prisma.seller.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                username: true,
                profilePic: true,
                isCompleted: true,
                description: true,
                brandPic: true,
                location: true,
            }
        });

        if (!seller) {
            return {
                success: false,
                message: 'Seller not found',
            };
        }

        return {
            success: true,
            message: 'Profile fetched',
            seller,
        };
    }

    async updateProfile(userId: string, data: {
        name?: string;
        description?: string;
        brandPic?: string;
        location?: string;
    }) {
        const updatedSeller = await this.prisma.seller.update({
            where: { id: userId },
            data: {
                ...(data.name && { name: data.name }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.brandPic !== undefined && { brandPic: data.brandPic }),
                ...(data.location !== undefined && { location: data.location }),
            }
        });

        return {
            success: true,
            message: 'Profile updated successfully',
            sellerId: updatedSeller.id,
        };
    }

    async deleteProfile(userId: string) {
        await this.prisma.seller.update({
            where: { id: userId },
            data: {
                isCompleted: false,
                description: null,
                brandPic: null,
                location: null,
            }
        });

        return {
            success: true,
            message: 'Profile reset successfully',
        };
    }
}
