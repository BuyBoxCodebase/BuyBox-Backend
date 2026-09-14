import { Injectable } from '@nestjs/common';
import { INotificationService } from './notification.interface';

@Injectable()
export class MockNotificationService implements INotificationService {
  async sendEmail(to: string, subject: string, content: string): Promise<void> {
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[MOCK EMAIL CONTENT]\n${content}`);
  }

  async sendSms(to: string, content: string): Promise<void> {
    console.log(`[MOCK SMS] To: ${to}`);
    console.log(`[MOCK SMS CONTENT]\n${content}`);
  }
}
