import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from 'src/customer/auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from 'src/customer/auth/guards/jwt-auth.guard';
import { GetUser, Roles, RolesGuard } from '../../../libs/common/src';
import { ActivityBatchDto, ActivityService, SessionListQuery } from './activity.service';
import { JourneyQuery, JourneyService } from './journey.service';

@Controller('analytics/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('batch')
  @HttpCode(200)
  async ingest(@Body() dto: ActivityBatchDto, @GetUser() user?: { userId: string; role: string }) {
    const customerId = user?.role === 'CUSTOMER' ? user.userId : undefined;
    return this.activityService.ingestBatch(dto, customerId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics/admin/sessions')
export class AdminActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get()
  async list(@Query() query: SessionListQuery) {
    return this.activityService.listSessions(query);
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get(':sessionId')
  async timeline(@Param('sessionId') sessionId: string) {
    return this.activityService.getSessionTimeline(sessionId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics/admin/journeys')
export class AdminJourneyController {
  constructor(private readonly journeyService: JourneyService) {}
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get()
  async overview(@Query() query: JourneyQuery) {
    return this.journeyService.getOverview(query);
  }
}
