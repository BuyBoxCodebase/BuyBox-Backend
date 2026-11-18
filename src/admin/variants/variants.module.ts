import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SearchModule } from '../../search/search.module';
import { StockAlertsModule } from '../../stock-alerts/stock-alerts.module';
import { AdminVariantsController } from './variants.controller';
import { AdminVariantsService } from './variants.service';

@Module({
  imports: [PrismaModule, SearchModule, StockAlertsModule],
  controllers: [AdminVariantsController],
  providers: [AdminVariantsService],
})
export class AdminVariantsModule { }
