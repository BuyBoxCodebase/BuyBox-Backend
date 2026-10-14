import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SellerOrderNotifier } from './seller-order-notifier.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';
import { WhatsAppConfig } from './whatsapp.config';

@Module({
  imports: [ConfigModule],
  providers: [WhatsAppConfig, WhatsAppCloudClient, SellerOrderNotifier],
  exports: [SellerOrderNotifier],
})
export class WhatsAppModule {}
