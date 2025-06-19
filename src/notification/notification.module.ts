import { Module } from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import { BullModule } from '@nestjs/bull';
import { EmailService } from './services/email.service';
import { NotificationProcessorService } from './services/notification-processor.service';
import { NotificationQueueService } from './services/notification-queue.service';
import { WhatsAppService } from './services/whatsapp.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  providers: [
    NotificationService,
    EmailService,
    WhatsAppService,
    // PushNotificationService,
    // InAppNotificationService,
    NotificationQueueService,
    NotificationProcessorService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule { }