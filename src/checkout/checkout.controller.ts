import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { DeliveryPricingService, QuoteRequest } from '../delivery-pricing/delivery-pricing.service';

@Controller('api/checkout')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly deliveryPricingService: DeliveryPricingService,
  ) {}

  @Post('delivery-quote')
  @HttpCode(HttpStatus.OK)
  getDeliveryQuote(@Body() body: QuoteRequest) {
    return this.deliveryPricingService.quote(body);
  }

  @Post('calculate-pickup-date')
  @HttpCode(HttpStatus.OK)
  calculatePickupDate(@Body() body: { orderTimestamp: string }) {
    return this.checkoutService.calculatePickupDate(body.orderTimestamp);
  }
}
