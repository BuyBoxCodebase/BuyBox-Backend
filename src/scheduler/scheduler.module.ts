import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { MockNotificationService } from './mock-notification.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule],
  providers: [SchedulerService, MockNotificationService],
  exports: [SchedulerService, MockNotificationService],
})
export class SchedulerModule { }
