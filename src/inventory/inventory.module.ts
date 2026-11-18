import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';
import { StockAlertsModule } from '../stock-alerts/stock-alerts.module';

@Module({
  imports: [
    PrismaModule,
    SearchModule,
    StockAlertsModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule { }
