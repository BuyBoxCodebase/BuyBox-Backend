import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationFrequency } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { NotificationQueueService } from './notification-queue.service';
import { WhatsAppService } from './whatsapp.service';
import { NotificationPayload, NotificationRecipient } from '../types/notification.type';

@Injectable()
export class NotificationService {
    constructor(
        private readonly emailService: EmailService,
        private readonly whatsAppService: WhatsAppService,
        // private readonly pushNotificationService: PushNotificationService,
        // private readonly inAppNotificationService: InAppNotificationService,
        private readonly notificationQueueService: NotificationQueueService,
        private readonly prisma: PrismaService,
    ) { }

    async sendNotification(
        recipient: NotificationRecipient,
        notification: NotificationPayload,
    ): Promise<void> {
        // Always save in-app notification regardless of preferences
        // await this.inAppNotificationService.createNotification(
        //     recipient.id,
        //     notification,
        // );

        const userModel = recipient.isSeller ? 'seller' : 'customer';
        const prefsField = recipient.isSeller ? 'sellerId' : 'customerId';

        // Get notification preferences
        const preferences = await this.prisma.notificationPreference.findUnique({
            where: {
                [prefsField]: recipient.id,
            },
            include: {
                [userModel]: true,
            },
        });

        if (!preferences) {
            // No preferences found, use default (email)
            await this.emailService.sendEmail(
                recipient.isSeller
                    ? preferences[userModel].email
                    : preferences[userModel].email,
                notification.title,
                notification.body,
            );
            return;
        }

        // Check if this type of notification is enabled
        if (!preferences[notification.type]) {
            return; // User has disabled this notification type
        }

        // Check quiet hours if enabled
        if (
            preferences.quietHoursEnabled &&
            this.isInQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd)
        ) {
            // During quiet hours, queue for later delivery
            await this.notificationQueueService.queueDelayedNotification(
                recipient,
                notification,
                this.getQuietHoursEndTime(preferences.quietHoursEnd),
            );
            return;
        }

        // For email with non-immediate frequency, queue for digest
        if (
            preferences.primaryChannel === NotificationChannel.EMAIL &&
            preferences.emailFrequency !== NotificationFrequency.IMMEDIATE
        ) {
            await this.notificationQueueService.queueForDigest(
                recipient,
                notification,
                preferences.emailFrequency,
            );
            return;
        }

        // Send via primary channel
        await this.sendViaChannel(
            preferences.primaryChannel,
            recipient,
            preferences,
            notification,
        );

        // Send via secondary channel if configured
        if (preferences.secondaryChannel) {
            await this.sendViaChannel(
                preferences.secondaryChannel,
                recipient,
                preferences,
                notification,
            );
        }
    }

    private async sendViaChannel(
        channel: NotificationChannel,
        recipient: NotificationRecipient,
        preferences: any,
        notification: NotificationPayload,
    ): Promise<void> {
        const user = recipient.isSeller
            ? preferences.seller
            : preferences.customer;

        switch (channel) {
            case NotificationChannel.EMAIL:
                await this.emailService.sendEmail(
                    user.email,
                    notification.title,
                    notification.body,
                );
                break;
            case NotificationChannel.WHATSAPP:
                if (preferences.whatsappNumber) {
                    await this.notificationQueueService.queueWhatsAppNotification(
                        recipient,
                        notification,
                        preferences.whatsappNumber,
                    );
                }
                break;
            // case NotificationChannel.PUSH:
            //     await this.pushNotificationService.sendPushNotification(
            //         recipient.id,
            //         notification,
            //     );
            //     break;
            case NotificationChannel.IN_APP:
                // Already handled at the beginning of sendNotification
                break;
        }
    }

    private isInQuietHours(start: string, end: string): boolean {
        if (!start || !end) return false;

        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();

        const [startHours, startMinutes] = start.split(':').map(Number);
        const [endHours, endMinutes] = end.split(':').map(Number);

        const startTime = startHours * 60 + startMinutes;
        const endTime = endHours * 60 + endMinutes;

        // Handle case where quiet hours span midnight
        if (startTime > endTime) {
            return currentTime >= startTime || currentTime <= endTime;
        }

        return currentTime >= startTime && currentTime <= endTime;
    }

    private getQuietHoursEndTime(end: string): Date {
        if (!end) return new Date(Date.now() + 8 * 60 * 60 * 1000); // Default 8 hours later

        const [endHours, endMinutes] = end.split(':').map(Number);
        const endDate = new Date();

        endDate.setHours(endHours, endMinutes, 0, 0);

        // If end time is earlier than current time, it means it's for tomorrow
        if (endDate < new Date()) {
            endDate.setDate(endDate.getDate() + 1);
        }

        return endDate;
    }
}