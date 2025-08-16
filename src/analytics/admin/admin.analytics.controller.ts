import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAnalyticsService } from './admin.analytics.service';
import { JwtAuthGuard } from 'src/customer/auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '@app/common';

@UseGuards(JwtAuthGuard, RolesGuard)
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