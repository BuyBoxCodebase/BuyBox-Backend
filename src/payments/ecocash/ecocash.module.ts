import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { OrderModule } from '../../order/order.module';
import { EcocashController } from './ecocash.controller';
import { EcocashService } from './ecocash.service';
import { EcocashClient } from './ecocash.client';

@Module({
  imports: [PrismaModule, OrderModule],
  controllers: [EcocashController],
  providers: [EcocashService, EcocashClient],
})
export class EcocashModule {}
