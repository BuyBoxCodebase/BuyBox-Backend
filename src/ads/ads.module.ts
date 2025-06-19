import { Module } from '@nestjs/common';
import { AdsService } from './ads.service';
import { AdsController } from './ads.controller';
import { AdMetricsService } from './ads-metrics.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';
import { SchedulerModule } from 'src/scheduler/scheduler.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    SchedulerModule,
  ],
  controllers: [AdsController],
  providers: [
    AdsService,
    AdMetricsService,
  ],
  exports: [
    AdsService,
    AdMetricsService,
  ],
})
export class AdsModule { }