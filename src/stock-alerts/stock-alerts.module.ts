import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StockAlertQueuer } from './stock-alert-queuer.service';
import { StockAlertWorkerClient } from './stock-alert-worker.client';
import { StockAlertsController } from './stock-alerts.controller';
import { StockAlertsService } from './stock-alerts.service';

// Stock alerts, backend side: customer requests, and queueing an alert when a watched product becomes available.
// Sending runs in the separate stock-alerts worker (apps/stock-alerts-worker, deployed on Railway).
@Module({
  imports: [PrismaModule],
  controllers: [StockAlertsController],
  providers: [StockAlertsService, StockAlertQueuer, StockAlertWorkerClient],
  exports: [StockAlertQueuer],
})
export class StockAlertsModule {}
