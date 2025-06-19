import { generateOTP } from '../../libs/common/src';
import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailer: MailerService,
        private readonly jwtService: JwtService,
    ) { }

    async getOngoingOrders(deliveryAgentId: string) {
        const ongoingOrders = await this.prisma.order.findMany({
            where: {
                deliveryAgentId,
                status: { in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
            },
        });
        return ongoingOrders;
    }

    async markOrderAsDelivered(orderId: string, deliveryAgentId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: {
                    select: {
                        email: true,
                    }
                }
            }
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }

        if (order.deliveryAgentId !== deliveryAgentId) {
            throw new ForbiddenException('You are not assigned to this order');
        }

        const orderVerificationOTP = generateOTP(6);
        const orderVerificationToken = this.jwtService.sign({
            orderId: order.id,
            deliveryAgentId,
            orderVerificationOTP
        }, { expiresIn: "10m" });

        await this.mailer.sendMail({
            email: order.email,
            mail_file: 'order_verification.ejs',
            subject: "Order Verification Mail",
            data: {
                otp: orderVerificationOTP
            }
        });

        return {
            orderVerificationToken
        };
    }

    async confirmDelivery(
        orderVerificationToken: string,
        deliveryAgentId: string,
        providedOtp: string
    ) {
        let payload: any;
        try {
            payload = this.jwtService.verify(orderVerificationToken);
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token');
        }

        if (payload.deliveryAgentId !== deliveryAgentId) {
            throw new ForbiddenException('Delivery agent mismatch');
        }

        if (payload.orderVerificationOTP !== providedOtp) {
            throw new ForbiddenException('Invalid OTP');
        }

        const order = await this.prisma.order.findUnique({
            where: { id: payload.orderId },
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }



        const updatedOrder = await this.prisma.$transaction(async (prisma) => {
            const updatedOrder = await this.prisma.order.update({
                where: { id: payload.orderId },
                data: { status: OrderStatus.COMPLETED },
            });

            await prisma.deliveryAgent.update({
                where: {
                    id: deliveryAgentId,
                },
                data: {
                    isAssigned: false
                }
            })
            return updatedOrder;
        })

        return updatedOrder;
    }
}
