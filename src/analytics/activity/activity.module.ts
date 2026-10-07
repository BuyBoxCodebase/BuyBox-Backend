import { Module } from '@nestjs/common';
import { ActivityController, AdminActivityController, AdminJourneyController } from './activity.controller';
import { ActivityService } from './activity.service';
import { JourneyService } from './journey.service';

@Module({
  controllers: [ActivityController, AdminActivityController, AdminJourneyController],
  providers: [ActivityService, JourneyService],
  exports: [ActivityService],
})
export class ActivityModule {}
