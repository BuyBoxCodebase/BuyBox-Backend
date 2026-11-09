import { Module } from '@nestjs/common';
import { SellerAnalyticsModule } from './seller/seller.analytics.module';
import { ActivityModule } from './activity/activity.module';
import { AdminAnalyticsModule } from './admin/admin.analytics.module';

@Module({
  imports: [
    SellerAnalyticsModule,
    ActivityModule,
    AdminAnalyticsModule,
  ],
})
export class AnalyticsModule { }
