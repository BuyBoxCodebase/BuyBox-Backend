import { Module } from '@nestjs/common';
import { SellerAnalyticsModule } from './seller/seller.analytics.module';
import { ActivityModule } from './activity/activity.module';

@Module({
  imports: [
    SellerAnalyticsModule,
    ActivityModule,
  ],
})
export class AnalyticsModule { }
