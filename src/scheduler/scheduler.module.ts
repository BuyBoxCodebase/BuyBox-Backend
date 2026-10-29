import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { MockNotificationService } from './mock-notification.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, WhatsAppModule],
  providers: [SchedulerService, MockNotificationService],
  exports: [SchedulerService, MockNotificationService],
})
export class SchedulerModule { }
