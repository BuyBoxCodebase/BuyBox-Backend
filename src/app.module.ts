import { Module } from '@nestjs/common';
import { CustomerModule } from './customer/customer.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { ProductModule } from './product/product.module';
import { BrandModule } from './brand/brand.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { InventoryModule } from './inventory/inventory.module';
import { MailerModule } from './mailer/mailer.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DeliveryModule } from './delivery/delivery.module';
import { AdminModule } from './admin/admin.module';
import { CategoryModule } from './category/category.module';
import { CouponModule } from './coupon/coupon.module';
import { AdsModule } from './ads/ads.module';
import { SellerModule } from './seller/seller.module';
import { DeliveryAgentModule } from './delivery-agent/delivery-agent.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ChatModule } from './chat/chat.module';
import { ReelsModule } from './reels/reels.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    PrismaModule,
    AdminModule,
    SellerModule,
    DeliveryModule,
    CustomerModule,
    BrandModule,
    ProductModule,
    CategoryModule,
    CartModule,
    OrderModule,
    InventoryModule,
    CouponModule,
    AdsModule,
    MailerModule,
    AnalyticsModule,
    DeliveryAgentModule,
    SchedulerModule,
    ChatModule,
    ReelsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
