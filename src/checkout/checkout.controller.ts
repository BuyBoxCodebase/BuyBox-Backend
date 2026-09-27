import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

@Controller('api/checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post('calculate-pickup-date')
  @HttpCode(HttpStatus.OK)
  calculatePickupDate(@Body() body: { orderTimestamp: string }) {
    return this.checkoutService.calculatePickupDate(body.orderTimestamp);
  }
}
