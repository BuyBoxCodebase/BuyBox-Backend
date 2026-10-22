import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryPricingModule } from '../delivery-pricing/delivery-pricing.module';

@Module({
  imports: [PrismaModule, DeliveryPricingModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
