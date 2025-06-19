import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AdminControlService {
    constructor(
        private prisma: PrismaService,
    ) { }

    async getAllAdmins() {
        const admins = await this.prisma.admin.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                profilePic: true,
                role: true,
                createdAt: true,
                isVerified: true,
            }
        });
        return admins;
    }

    async getAllSellers(page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [sellers, total] = await Promise.all([
            this.prisma.seller.findMany({
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    profilePic: true,
                    phoneNumber: true,
                    isCompleted: true,
                    createdAt: true,
                    brand: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            brandPic: true,
                            createdAt: true,
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            }),
            this.prisma.seller.count()
        ]);

        return {
            data: sellers,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: skip + limit < total,
                hasPrevPage: page > 1
            }
        };
    }

    async getAllCustomers(page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [customers, total] = await Promise.all([
            this.prisma.customer.findMany({
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                },
                omit: {
                    password: true,
                    googleId: true,
                    facebookId: true,
                    interests: true,
                    username: true,
                    updatedAt: true,
                }
            }),
            this.prisma.customer.count()
        ]);

        return {
            data: customers,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: skip + limit < total,
                hasPrevPage: page > 1
            }
        };
    }

    async getAllDeliveryAgents(page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [deliveryAgents, total] = await Promise.all([
            this.prisma.deliveryAgent.findMany({
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                }
            }),
            this.prisma.deliveryAgent.count()
        ]);

        return {
            data: deliveryAgents,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: skip + limit < total,
                hasPrevPage: page > 1
            }
        };
    }

    async getAllOrders(page = 1, limit = 10) {
        const skip = (page - 1) * limit;

        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                }
            }),
            this.prisma.order.count()
        ]);

        return {
            data: orders,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: skip + limit < total,
                hasPrevPage: page > 1
            }
        };
    }

    async assignOrderToDeliveryAgent(orderId: string, deliveryAgentId: string) {
        const order = await this.prisma.$transaction(async (prisma) => {
            const updatedOrder = await prisma.order.update({
                where: { id: orderId },
                data: {
                    deliveryAgentId,
                    status: OrderStatus.PROCESSING,
                },
            });
            await prisma.deliveryAgent.update({
                where: {
                    id: deliveryAgentId,
                },
                data: {
                    isAssigned: true
                }
            })
            return updatedOrder;
        })

        return order;
    }

    async grantAdmin(userId: string) {
        const admin = await this.prisma.admin.update({
            where: { id: userId },
            data: {
                isVerified: true
            }
        });

        return admin;
    }

    async revokeAdmin(userId: string) {
        const admin = await this.prisma.admin.update({
            where: { id: userId },
            data: {
                isVerified: false
            }
        });

        return admin;
    }
}