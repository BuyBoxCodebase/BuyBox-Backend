import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';
import { SessionAuthGuard } from '../../libs/shared/src';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  @Roles("CUSTOMER")
  @Post('/create-order')
  createOrder(@GetUser("userId") userId: string, @Body() createOrderDto: CreateOrderDto) {
    return this.orderService.createOrder(userId, createOrderDto);
  }

  @Roles("CUSTOMER")
  @Get('/get-all-orders')
  getAllOrders(@GetUser("userId") userId: string) {
    return this.orderService.getOrders(userId);
  }

  @Roles("CUSTOMER")
  @Get('/get-order-details/:id')
  getOrderDetails(@GetUser("userId") userId: string, @Param('id') orderId: string) {
    return this.orderService.getOrderDetails(userId, orderId);
  }

  @Roles("SELLER")
  @Get('/seller/get-orders')
  getSellerOrders(@GetUser("userId") userId: string) {
    return this.orderService.getSellerOrders(userId);
  }

  @Roles("CUSTOMER")
  @Delete('/cancel-order/:id')
  cancelOrder(@GetUser("userId") userId: string, @Param('id') orderId: string) {
    return this.orderService.cancelOrder(userId, orderId);
  }

  @Roles("CUSTOMER")
  @Get('/delivery')
  getDueOrders() {
    return this.orderService.getDueOrders();
  }
}
