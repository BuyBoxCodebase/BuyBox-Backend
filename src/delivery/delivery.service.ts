import { generateOTP, safely } from '../../libs/common/src';
import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OrderStatus, UserEventType } from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CustomerOrderNotifier } from '../whatsapp/customer-order-notifier.service';
import { ReferralService } from '../referral/referral.service';

@Injectable()
export class DeliveryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailer: MailerService,
        private readonly jwtService: JwtService,
        private readonly events: EventsService,
        private readonly customerOrderNotifier: CustomerOrderNotifier,
        private readonly referralService: ReferralService,
    ) { }

    async getOngoingOrders(deliveryAgentId: string) {
        const ongoingOrders = await this.prisma.order.findMany({
            where: {
                deliveryAgentId,
                status: {
                    in: [
                        OrderStatus.PENDING,
                        OrderStatus.PROCESSING,
                        OrderStatus.DISPATCHED,
                        OrderStatus.OUT_FOR_DELIVERY,
                    ],
                },
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
            include: {
                products: {
                    include: {
                        product: true
                    }
                }
            }
        });

        if (!order) {
            throw new NotFoundException('Order not found');
        }



        const updatedOrder = await this.prisma.$transaction(async (prisma) => {
            const updatedOrder = await this.prisma.order.update({
                where: { id: payload.orderId },
                data: { status: OrderStatus.COMPLETED },
            });

            await this.referralService.settleForOrder(payload.orderId, OrderStatus.COMPLETED, prisma);

            await prisma.deliveryAgent.update({
                where: {
                    id: deliveryAgentId,
                },
                data: {
                    isAssigned: false
                }
            })

            // Log ORDER_COMPLETED and ORDER_DELIVERED event for each product in the order
            await Promise.all(order.products.flatMap((item) =>
                [UserEventType.ORDER_COMPLETED, UserEventType.ORDER_DELIVERED].map((type) =>
                    safely('DeliveryService: logging order event', this.events.logUserEvent({
                        customerId: order.userId,
                        sessionId: 'system-delivery',
                        productId: item.productId,
                        categoryId: item.product.categoryId || undefined,
                        type,
                    }), { orderId: order.id, productId: item.productId, type })
                )
            ));

            return updatedOrder;
        })

        await safely(
            'DeliveryService.confirmDelivery: WhatsApp order delivered',
            this.customerOrderNotifier.notifyOrderDelivered(order.id),
            { orderId: order.id },
        );

        return updatedOrder;
    }
}
