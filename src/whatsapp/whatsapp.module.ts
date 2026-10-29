import { Module } from '@nestjs/common';
import { SellerOrderNotifier } from './seller-order-notifier.service';
import { CustomerOrderNotifier } from './customer-order-notifier.service';
import { WhatsAppCloudClient } from './whatsapp-cloud.client';

@Module({
  providers: [WhatsAppCloudClient, SellerOrderNotifier, CustomerOrderNotifier],
  exports: [SellerOrderNotifier, CustomerOrderNotifier],
})
export class WhatsAppModule {}
