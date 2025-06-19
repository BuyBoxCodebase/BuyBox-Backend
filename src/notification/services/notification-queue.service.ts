import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { NotificationPayload, NotificationRecipient } from './notification.service';
import { NotificationFrequency } from '@prisma/client';

export interface QueuedNotification {
    recipient: NotificationRecipient;
    notification: NotificationPayload;
    additionalData?: Record<string, any>;
}

@Injectable()
export class NotificationQueueService {
    constructor(
        @InjectQueue('notifications') private notificationsQueue: Queue,
    ) { }

    async queueWhatsAppNotification(
        recipient: NotificationRecipient,
        notification: NotificationPayload,
        whatsappNumber: string,
    ): Promise<void> {
        await this.notificationsQueue.add(
            'whatsapp',
            {
                recipient,
                notification,
                additionalData: { whatsappNumber },
            },
            {
                removeOnComplete: true,
            },
        );
    }

    async queueDelayedNotification(
        recipient: NotificationRecipient,
        notification: NotificationPayload,
        deliverAt: Date,
    ): Promise<void> {
        const delay = deliverAt.getTime() - Date.now();

        await this.notificationsQueue.add(
            'delayed',
            {
                recipient,
                notification,
            },
            {
                delay: Math.max(0, delay),
                removeOnComplete: true,
            },
        );
    }

    async queueForDigest(
        recipient: NotificationRecipient,
        notification: NotificationPayload,
        frequency: NotificationFrequency,
    ): Promise<void> {
        const jobId = `digest:${frequency}:${recipient.id}`;

        await this.notificationsQueue.add(
            'digest-item',
            {
                recipient,
                notification,
                frequency,
            },
            {
                jobId, // Using jobId to easily find and update existing digests
                removeOnComplete: true,
            },
        );

        // Schedule the digest delivery if not already scheduled
        const nextDeliveryTime = this.calculateNextDigestTime(frequency);

        // Check if there's already a scheduled digest
        const existingJobs = await this.notificationsQueue.getJobs(['delayed']);
        const existingDigestJob = existingJobs.find(
            job => job.name === 'send-digest' &&
                job.data.recipient.id === recipient.id &&
                job.data.frequency === frequency
        );

        if (!existingDigestJob) {
            await this.notificationsQueue.add(
                'send-digest',
                {
                    recipient,
                    frequency,
                },
                {
                    delay: nextDeliveryTime.getTime() - Date.now(),
                    removeOnComplete: true,
                },
            );
        }
    }

    private calculateNextDigestTime(frequency: NotificationFrequency): Date {
        const now = new Date();
        const nextDelivery = new Date(now);

        switch (frequency) {
            case NotificationFrequency.DAILY_DIGEST:
                // Send at 9:00 AM
                nextDelivery.setHours(9, 0, 0, 0);
                // If it's already past 9 AM, schedule for tomorrow
                if (nextDelivery <= now) {
                    nextDelivery.setDate(nextDelivery.getDate() + 1);
                }
                break;

            case NotificationFrequency.WEEKLY_DIGEST:
                // Send on Sunday at 9:00 AM
                const daysUntilSunday = 7 - now.getDay();
                nextDelivery.setDate(now.getDate() + daysUntilSunday);
                nextDelivery.setHours(9, 0, 0, 0);
                // If it's already Sunday past 9 AM, schedule for next Sunday
                if (nextDelivery <= now) {
                    nextDelivery.setDate(nextDelivery.getDate() + 7);
                }
                break;

            default:
                // Immediate or unknown frequency - schedule in 1 minute
                nextDelivery.setMinutes(now.getMinutes() + 1);
                break;
        }

        return nextDelivery;
    }
}