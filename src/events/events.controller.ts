import { Controller, Post, Body, Req } from '@nestjs/common';
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
  @Post('product')
  log(@Body() dto: LogEventDto, @Req() req: any) {
    const customerId = req.user?.id;
    if (!customerId) return; // skip anonymous -- no session to cluster on
    return this.events.logProductEvent({ ...dto, customerId });
  }
}