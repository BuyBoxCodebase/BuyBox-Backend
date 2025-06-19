import { Controller, Get, UseGuards } from '@nestjs/common';
import { SellerAnalyticsService } from './seller.analytics.service';
import { GetUser, Roles, RolesGuard } from '@app/common';
import { SessionAuthGuard } from '../../../libs/shared/src';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('analytics/seller')
export class SellerAnalyticsController {
    constructor(private readonly sellerAnalyticsService: SellerAnalyticsService) { }

    @Roles("SELLER")
    @Get('')
    async getSellerAnalytics(@GetUser("userId") userId: string,) {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();

        const [
            totalRevenue,
            subscriptions,
            sales,
            recentSales,
            monthlyData
        ] = await Promise.all([
            this.sellerAnalyticsService.getTotalRevenue(userId, currentMonth, currentYear),
            this.sellerAnalyticsService.getTotalSubscriptions(userId, currentMonth, currentYear),
            this.sellerAnalyticsService.getTotalSales(userId, currentMonth, currentYear),
            this.sellerAnalyticsService.getRecentSales(userId, currentMonth, currentYear),
            this.sellerAnalyticsService.getMonthlyData(userId, currentYear),
        ]);

        return {
            totalRevenue,
            subscriptions,
            sales,
            activeNow: {
                count: '+573',
                change: '+201 since last hour'
            },
            recentSales,
            monthlyData,
        };
    }
}