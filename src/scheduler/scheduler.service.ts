import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { MockNotificationService } from './mock-notification.service';
import * as moment from 'moment-timezone';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SchedulerService.name);
    private timeoutMap: Map<string, NodeJS.Timeout> = new Map();
    private cronJobMap: Map<string, CronJob> = new Map();
    private jobCount = 0;

    constructor(
        private schedulerRegistry: SchedulerRegistry,
        private prisma: PrismaService,
        private notificationService: MockNotificationService
    ) { }

    onModuleInit() {
        this.logger.log('Scheduler service initialized');
        this.registerPickupNotifications();
    }

    private registerPickupNotifications() {
        // Daily Ready Notification at 7am
        this.scheduleRecurringJob('0 7 * * *', async () => {
            this.logger.debug('Running Daily Ready Notification Job');
            const tomorrow = moment.tz('Africa/Harare').add(1, 'day').startOf('day');
            const endOfTomorrow = moment.tz('Africa/Harare').add(1, 'day').endOf('day');

            const orders = await this.prisma.order.findMany({
                where: {
                    fulfillmentType: 'PICKUP',
                    status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELED] },
                    pickupDate: {
                        gte: tomorrow.toDate(),
                        lte: endOfTomorrow.toDate(),
                    },
                },
                include: { pickupLocation: true }
            });

            for (const order of orders) {
                if (order.pickupLocation) {
                    await this.prisma.order.update({
                        where: { id: order.id },
                        data: { status: 'READY_FOR_PICKUP' }
                    });
                    const subject = `Your Treides order is ready!`;
                    let content = `Your Treides order is ready!\n${order.pickupLocation.name}\nOpen 9am - 4pm\n(Closed Sundays)\n`;
                    if (order.pickupLocation.coordinates) {
                        const coords = order.pickupLocation.coordinates as any;
                        if (coords.latitude && coords.longitude) {
                            content += `Get Directions: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
                        }
                    }
                    await this.notificationService.sendEmail(order.email, subject, content);
                    await this.notificationService.sendSms(order.phoneNumber, content);
                }
            }
        }, 'DailyReadyNotification', 'Africa/Harare');

        // Pickup Reminder at 8am
        this.scheduleRecurringJob('0 8 * * *', async () => {
            this.logger.debug('Running Pickup Reminder Job');
            const today = moment.tz('Africa/Harare').startOf('day');
            const endOfToday = moment.tz('Africa/Harare').endOf('day');

            const orders = await this.prisma.order.findMany({
                where: {
                    fulfillmentType: 'PICKUP',
                    status: 'READY_FOR_PICKUP',
                    pickupDate: {
                        gte: today.toDate(),
                        lte: endOfToday.toDate(),
                    },
                },
                include: { pickupLocation: true }
            });

            for (const order of orders) {
                if (order.pickupLocation) {
                    let content = `Reminder: Pick up your Treides order today!\n${order.pickupLocation.name}, 9am-4pm\n`;
                    if (order.pickupLocation.coordinates) {
                        const coords = order.pickupLocation.coordinates as any;
                        if (coords.latitude && coords.longitude) {
                            content += `Get Directions: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
                        }
                    }
                    await this.notificationService.sendSms(order.phoneNumber, content);
                }
            }
        }, 'PickupReminder', 'Africa/Harare');
    }

    onModuleDestroy() {
        this.logger.log('Cleaning up scheduler service resources');
        // Clear all timeouts
        for (const [name, timeout] of this.timeoutMap.entries()) {
            this.logger.debug(`Clearing timeout: ${name}`);
            clearTimeout(timeout);
        }

        // Stop all cron jobs
        for (const [name, job] of this.cronJobMap.entries()) {
            this.logger.debug(`Stopping cron job: ${name}`);
            job.stop();
        }
    }

    scheduleJob(date: Date, callback: () => void, name?: string): string {
        const jobId = name || `job_${++this.jobCount}`;
        const now = new Date();

        if (date <= now) {
            this.logger.warn(`Job ${jobId} scheduled for past date. Executing immediately.`);
            callback();
            return jobId;
        }

        const delay = date.getTime() - now.getTime();
        this.logger.debug(`Scheduling job ${jobId} to run in ${delay}ms`);

        const timeout = setTimeout(async () => {
            try {
                this.logger.debug(`Executing scheduled job: ${jobId}`);
                await callback();
                this.timeoutMap.delete(jobId);
            } catch (error) {
                this.logger.error(`Error executing scheduled job ${jobId}: ${error.message}`, error.stack);
            }
        }, delay);

        this.timeoutMap.set(jobId, timeout);
        return jobId;
    }

    scheduleRecurringJob(cronExpression: string, callback: () => void, name?: string, timeZone?: string): string {
        const jobId = name || `recurring_job_${++this.jobCount}`;

        try {
            const job = new CronJob(
                cronExpression,
                async () => {
                    try {
                        this.logger.debug(`Executing recurring job: ${jobId}`);
                        await callback();
                    } catch (error) {
                        this.logger.error(`Error executing recurring job ${jobId}: ${error.message}`, error.stack);
                    }
                },
                null,
                true,
                timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
            );

            this.cronJobMap.set(jobId, job);
            // job.start(); is automatically handled by the 4th parameter (true) or we can call start if we set it to false.
            // Since we set it to true, it starts immediately.

            this.logger.debug(`Scheduled recurring job ${jobId} with cron expression: ${cronExpression}`);
            return jobId;
        } catch (error) {
            this.logger.error(`Error creating cron job with expression ${cronExpression}: ${error.message}`);
            throw error;
        }
    }

    cancelJob(jobId: string): boolean {
        if (this.timeoutMap.has(jobId)) {
            clearTimeout(this.timeoutMap.get(jobId));
            this.timeoutMap.delete(jobId);
            this.logger.debug(`Canceled one-time job: ${jobId}`);
            return true;
        }

        if (this.cronJobMap.has(jobId)) {
            const job = this.cronJobMap.get(jobId);
            job.stop();
            this.cronJobMap.delete(jobId);
            this.logger.debug(`Canceled recurring job: ${jobId}`);
            return true;
        }

        this.logger.warn(`Attempted to cancel non-existent job: ${jobId}`);
        return false;
    }

    getActiveJobs(): any {
        const oneTimeJobs = Array.from(this.timeoutMap.keys());
        const recurringJobs = Array.from(this.cronJobMap.keys()).map(name => {
            const job = this.cronJobMap.get(name);
            return {
                name,
                cronTime: job.cronTime.toString(),
                running: job.runOnce
            };
        });

        return {
            oneTimeJobs,
            recurringJobs,
            total: oneTimeJobs.length + recurringJobs.length
        };
    }
}