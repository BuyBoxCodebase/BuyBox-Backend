import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { GetUser, Roles, RolesGuard } from '../../libs/common/src';
import { SessionAuthGuard } from '@app/shared';

@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("DELIVERY_AGENT")
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) { }

  @Get('/ongoing-orders')
  async getOngoingOrders(@GetUser("userId") userId: string) {
    return this.deliveryService.getOngoingOrders(userId);
  }

  @Post('/mark-delivered')
  async markOrderAsDelivered(@GetUser("userId") userId: string, @Body() body: { orderId: string }) {
    return this.deliveryService.markOrderAsDelivered(body.orderId, userId);
  }

  @Post('/confirm-delivery')
  async confirmDelivery(
    @GetUser("userId") userId: string,
    @Body() body: { orderVerificationToken: string; providedOtp: string }
  ) {
    return this.deliveryService.confirmDelivery(body.orderVerificationToken, userId, body.providedOtp);
  }
}
