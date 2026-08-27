import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { EventsService } from './events.service';
import { ProductEventType } from '@prisma/client';

export class LogEventDto {
  productId: string;
  categoryId?: string;
  type: ProductEventType;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  // Called by the frontend (or backend order hook) on:
  //   - product detail page mount    → type: VIEW
  //   - "add to cart" button press   → type: CART_ADD
  //   - order status → COMPLETED     → type: ORDER_COMPLETED
  //     (fire once per product in the completed order, from your
  //      existing order-completion flow in the main backend)
  //
  // POST /events/product
  // Body: { productId, categoryId?, type }
  // Auth: requires a logged-in customer (req.user.id)
  @UseGuards(JwtAuthGuard)
  @Post('product')
  async log(@Body() dto: LogEventDto, @GetUser('userId') userId: string) {
    if (!userId) {
      // return a meaningful error or just exit
      return { success: false, message: 'Missing user ID' };
    }
    await this.events.logProductEvent({ ...dto, customerId: userId });
    return { success: true };
  }
}