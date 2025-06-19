import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SchedulerService.name);
    private timeoutMap: Map<string, NodeJS.Timeout> = new Map();
    private cronJobMap: Map<string, CronJob> = new Map();
    private jobCount = 0;

    constructor(private schedulerRegistry: SchedulerRegistry) { }

    onModuleInit() {
        this.logger.log('Scheduler service initialized');
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

    scheduleRecurringJob(cronExpression: string, callback: () => void, name?: string): string {
        const jobId = name || `recurring_job_${++this.jobCount}`;

        try {
            const job = new CronJob(cronExpression, async () => {
                try {
                    this.logger.debug(`Executing recurring job: ${jobId}`);
                    await callback();
                } catch (error) {
                    this.logger.error(`Error executing recurring job ${jobId}: ${error.message}`, error.stack);
                }
            });

            this.cronJobMap.set(jobId, job);
            job.start();

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