import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    PrismaModule,
    SearchModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule { }
