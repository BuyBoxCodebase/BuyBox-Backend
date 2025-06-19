import { Injectable, Logger } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { QueuedNotification } from './notification-queue.service';
import { WhatsAppService } from './whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationFrequency } from '@prisma/client';
import { NotificationService } from './notification.service';
import { EmailService } from './email.service';

@Injectable()
@Processor('notifications')
export class NotificationProcessorService {
    private readonly logger = new Logger(NotificationProcessorService.name);

    constructor(
        private readonly emailService: EmailService,
        private readonly whatsAppService: WhatsAppService,
        private readonly prisma: PrismaService,
        private readonly notificationService: NotificationService,
    ) { }

    @Process('whatsapp')
    async processWhatsAppNotification(job: Job<QueuedNotification>): Promise<void> {
        try {
            const { notification, additionalData } = job.data;
            const whatsappNumber = additionalData?.whatsappNumber;

            if (!whatsappNumber) {
                this.logger.error('WhatsApp number missing in job data');
                return;
            }

            await this.whatsAppService.queueMessage(whatsappNumber, notification);
        } catch (error) {
            this.logger.error('Failed to process WhatsApp notification', error);
            throw error;
        }
    }

    @Process('delayed')
    async processDelayedNotification(job: Job<QueuedNotification>): Promise<void> {
        try {
            const { recipient, notification } = job.data;
            // Re-send through the main notification service
            await this.notificationService.sendNotification(recipient, notification);
        } catch (error) {
            this.logger.error('Failed to process delayed notification', error);
            throw error;
        }
    }

    @Process('digest-item')
    async processDigestItem(job: Job<QueuedNotification & { frequency: NotificationFrequency }>): Promise<void> {
        // This processor just adds items to the digest
        // Actual sending happens in the send-digest processor
        this.logger.debug(`Added item to digest for ${job.data.recipient.id}`);
    }

    @Process('send-digest')
    async processSendDigest(
        job: Job<{
            [x: string]: any; recipient: { id: string; isSeller: boolean }; frequency: NotificationFrequency
        }>
    ): Promise<void> {
        try {
            const { recipient, frequency } = job.data;

            // Get all digest items for this recipient and frequency
            const digestJobs = await job.queue.getJobs(['active', 'waiting', 'delayed']);
            const digestItems = digestJobs
                .filter(j =>
                    j.name === 'digest-item' &&
                    j.data.recipient.id === recipient.id &&
                    j.data.frequency === frequency
                )
                .map(j => j.data.notification);

            if (digestItems.length === 0) {
                this.logger.debug(`No digest items for ${recipient.id}`);
                return;
            }

            // Group by notification type
            const groupedByType = digestItems.reduce((acc, item) => {
                if (!acc[item.type]) {
                    acc[item.type] = [];
                }
                acc[item.type].push(item);
                return acc;
            }, {});

            // Create digest content
            let digestTitle = '';
            let digestBody = '';

            switch (frequency) {
                case NotificationFrequency.DAILY_DIGEST:
                    digestTitle = 'Your Daily Notification Summary';
                    break;
                case NotificationFrequency.WEEKLY_DIGEST:
                    digestTitle = 'Your Weekly Notification Summary';
                    break;
                default:
                    digestTitle = 'Your Notification Summary';
            }

            // Add summary of notifications by type
            Object.entries(groupedByType).forEach(([type, items]) => {
                const readableType = this.getReadableType(type);
                digestBody += `\n## ${readableType} (${items.length})\n\n`;

                items.slice(0, 5).forEach(item => {
                    digestBody += `- ${item.title}\n`;
                });

                if (items.length > 5) {
                    digestBody += `- ...and ${items.length - 5} more ${readableType} notifications\n`;
                }

                digestBody += '\n';
            });

            // Add footer
            digestBody += '\nVisit your dashboard for more details.';

            // Get user's email
            const userModel = recipient.isSeller ? 'seller' : 'customer';
            const prefsField = recipient.isSeller ? 'sellerId' : 'customerId';

            const user = await this.prisma[userModel].findUnique({
                where: { id: recipient.id },
                select: { email: true },
            });

            if (!user) {
                this.logger.error(`User not found: ${recipient.id}`);
                return;
            }

            // Send the digest email
            await this.emailService.sendEmail(
                user.email,
                digestTitle,
                digestBody,
            );

            // Remove the processed digest items
            await Promise.all(
                digestJobs
                    .filter(j =>
                        j.name === 'digest-item' &&
                        j.data.recipient.id === recipient.id &&
                        j.data.frequency === frequency
                    )
                    .map(j => j.remove())
            );

            // Schedule the next digest
            const notificationQueueService = new NotificationQueueService(job.queue);

            const nextDeliveryTime = this.calculateNextDigestTime(frequency);
            await notificationQueueService.queueDelayedNotification(
                recipient,
                {
                    title: 'Next Digest',
                    body: 'This is a placeholder for the next digest.',
                    type: 'placeholder',
                },
                nextDeliveryTime,
            );
        } catch (error) {
            this.logger.error('Failed to process digest', error);
            throw error;
        }
    }

    private getReadableType(type: string): string {
        switch (type) {
            case 'orderUpdates': return 'Order Updates';
            case 'promotions': return 'Promotions';
            case 'accountAlerts': return 'Account Alerts';
            case 'deliveryUpdates': return 'Delivery Updates';
            case 'inventoryAlerts': return 'Inventory Alerts';
            default: return type;
        }
    }

    private calculateNextDigestTime(frequency: NotificationFrequency): Date {
        const now = new Date();
        const nextDelivery = new Date(now);

        switch (frequency) {
            case NotificationFrequency.DAILY_DIGEST:
                nextDelivery.setDate(nextDelivery.getDate() + 1);
                nextDelivery.setHours(9, 0, 0, 0);
                break;

            case NotificationFrequency.WEEKLY_DIGEST:
                nextDelivery.setDate(nextDelivery.getDate() + 7);
                nextDelivery.setHours(9, 0, 0, 0);
                break;

            default:
                nextDelivery.setMinutes(now.getMinutes() + 1);
                break;
        }

        return nextDelivery;
    }
}