import { Module } from '@nestjs/common';
import { SellerAnalyticsModule } from './seller/seller.analytics.module';

@Module({
  imports: [
    SellerAnalyticsModule,
  ],
})
export class AnalyticsModule { }
