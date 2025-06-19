import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class DeliveryAgentProfileService {
    constructor(
        private prisma: PrismaService,
        private readonly cloudinaryService: CloudinaryService,
    ) { }

    async getDeliveryAgentDetails(userId: string) {
        const deliveryAgent = await this.prisma.deliveryAgent.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                name: true,
                email: true,
                isCompleted: true,
                profilePic: true,
                phoneNumber: true,
            }
        });

        if (!deliveryAgent) {
            return {
                success: false,
                message: "Failed to fetch"
            };
        }

        return {
            success: true,
            message: "Delivery Agent fetched",
            deliveryAgent
        }
    }

    async updateDeliveryAgent(userId: string, data: { name: string, phoneNumber: string; profilePic: string; }) {
        const updatedDeliveryAgent = await this.prisma.deliveryAgent.update({
            where: {
                id: userId
            },
            data: {
                name: data.name,
                phoneNumber: data.phoneNumber,
                profilePic: data.profilePic,
                isCompleted: true,
            }
        });

        return {
            success: true,
            message: "Update DeliveryAgent details",
            userId: updatedDeliveryAgent.id
        }
    }
}
