import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
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

    async getPasswordStatus(userId: string) {
        const customer = await this.prisma.customer.findUnique({
            where: { id: userId },
            select: { password: true },
        });
        if (!customer) throw new NotFoundException('Customer not found');

        return { hasPassword: !!customer.password };
    }

    // Google-only accounts have no password yet, so they can set one without a current password.
    async setPassword(userId: string, currentPassword: string | undefined, newPassword: string) {
        if (!newPassword || newPassword.length < 8) {
            throw new BadRequestException('Password must be at least 8 characters');
        }

        const customer = await this.prisma.customer.findUnique({ where: { id: userId } });
        if (!customer) throw new NotFoundException('Customer not found');

        if (customer.password) {
            // 400 rather than 401: the session is fine, the typed password isn't.
            if (!currentPassword || !(await argon2.verify(customer.password, currentPassword))) {
                throw new BadRequestException('Current password is incorrect');
            }
        }

        await this.prisma.customer.update({
            where: { id: userId },
            data: { password: await argon2.hash(newPassword) },
        });

        return { success: true, message: customer.password ? 'Password changed' : 'Password set' };
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

    async updateCustomerDetails(userId: string, data: { name?: string, username?: string, phoneNumber?: string; profilePic?: string }) {
        const updateData: any = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.username !== undefined) updateData.username = data.username;
        if (data.phoneNumber !== undefined) updateData.phoneNumber = data.phoneNumber;
        if (data.profilePic !== undefined) updateData.profilePic = data.profilePic;

        const updatedCustomer = await this.prisma.customer.update({
            where: { id: userId },
            data: updateData
        });

        return {
            success: true,
            message: "Update Customer details",
            userId: updatedCustomer.id
        }
    }
}
