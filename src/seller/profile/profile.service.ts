import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { normalizePhone } from 'src/whatsapp/whatsapp-format';
import { isValidCoordinates } from 'src/delivery-pricing/pricing';
import { Coordinates } from 'src/delivery-pricing/delivery-pricing.types';

@Injectable()
export class SellerProfileService {
    constructor(
        private prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    async getPasswordStatus(userId: string) {
        const seller = await this.prisma.seller.findUnique({
            where: { id: userId },
            select: { password: true },
        });
        if (!seller) throw new NotFoundException('Seller not found');

        return { hasPassword: !!seller.password };
    }

    // Google-only accounts have no password yet, so they can set one without a current password.
    async setPassword(userId: string, currentPassword: string | undefined, newPassword: string) {
        if (!newPassword || newPassword.length < 8) {
            throw new BadRequestException('Password must be at least 8 characters');
        }

        const seller = await this.prisma.seller.findUnique({ where: { id: userId } });
        if (!seller) throw new NotFoundException('Seller not found');

        if (seller.password) {
            // 400 rather than 401: the session is fine, the typed password isn't.
            if (!currentPassword || !(await argon2.verify(seller.password, currentPassword))) {
                throw new BadRequestException('Current password is incorrect');
            }
        }

        await this.prisma.seller.update({
            where: { id: userId },
            data: { password: await argon2.hash(newPassword) },
        });

        return { success: true, message: seller.password ? 'Password changed' : 'Password set' };
    }

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
        coordinates?: Coordinates;
        phoneNumber?: string;
    }) {
        const phoneNumber = this.parsePhoneNumber(data.phoneNumber);
        const coordinates = this.parseCoordinates(data.coordinates);

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
                ...(coordinates && { coordinates }),
                ...(phoneNumber && { phoneNumber }),
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
                coordinates: true,
                phoneNumber: true,
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
        coordinates?: Coordinates;
        phoneNumber?: string;
    }) {
        const phoneNumber = this.parsePhoneNumber(data.phoneNumber);
        const coordinates = this.parseCoordinates(data.coordinates);

        const updatedSeller = await this.prisma.seller.update({
            where: { id: userId },
            data: {
                ...(data.name && { name: data.name }),
                ...(phoneNumber && { phoneNumber }),
                ...(data.description !== undefined && { description: data.description }),
                ...(data.brandPic !== undefined && { brandPic: data.brandPic }),
                ...(coordinates && { coordinates }),
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
                coordinates: null,
            }
        });

        return {
            success: true,
            message: 'Profile reset successfully',
        };
    }

    // The seller's location decides which hub their products ship from, so it must be a real point
    private parseCoordinates(value?: Coordinates): Coordinates | undefined {
        if (value === undefined || value === null) {
            return undefined;
        }
        if (!isValidCoordinates(value)) {
            throw new BadRequestException('Location must have a valid latitude and longitude');
        }
        return { latitude: value.latitude, longitude: value.longitude };
    }

    // The seller's WhatsApp number, where new-order messages are sent. Stored as typed;
    // the WhatsApp sender normalises it. Blank means "leave unchanged".
    private parsePhoneNumber(value?: string): string | undefined {
        const phoneNumber = value?.trim();
        if (!phoneNumber) return undefined;
        if (!normalizePhone(phoneNumber, '')) {
            throw new BadRequestException('Please enter a valid WhatsApp number, including the country code.');
        }
        return phoneNumber;
    }
}
