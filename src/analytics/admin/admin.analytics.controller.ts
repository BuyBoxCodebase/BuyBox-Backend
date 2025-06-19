import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAnalyticsService } from './admin.analytics.service';
import { Roles, RolesGuard } from '@app/common';
import { SessionAuthGuard } from '@app/shared';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('analytics/admin')
export class AdminAnalyticsController {
    constructor(private readonly adminAnalyticsService: AdminAnalyticsService) { }

    @Roles("ADMIN", "SUPER_ADMIN")
    @Get('/users')
    async getAllCustomers(
        @Query('cursor') cursor?: string,
        @Query('limit') limit?: string,
    ) {
        return this.adminAnalyticsService.getAllCustomers({
            cursor: cursor ? { id: cursor } : undefined,
            limit: limit ? parseInt(limit) : 10,
        });
    }
}