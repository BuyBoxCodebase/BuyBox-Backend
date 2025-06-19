import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SellerAnalyticsController } from './seller.analytics.controller';
import { SellerAnalyticsService } from './seller.analytics.service';

@Module({
    imports: [PrismaModule],
    controllers: [SellerAnalyticsController],
    providers: [SellerAnalyticsService],
    exports: [SellerAnalyticsService],
})
export class SellerAnalyticsModule { }