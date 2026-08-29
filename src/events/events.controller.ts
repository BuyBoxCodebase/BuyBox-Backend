import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../customer/auth/guards/optional-jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { EventsService } from './events.service';
import { ProductEventType } from '@prisma/client';

export class LogEventDto {
  sessionId: string;
  type: ProductEventType;
  productId?: string;
  categoryId?: string;
  device?: string;
  platform?: string;
  source?: string;
  metadata?: any;
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
  // Body: { sessionId, type, productId?, categoryId?, device?, platform?, source?, metadata? }
  // Auth: optional, links to customerId if logged in
  @UseGuards(OptionalJwtAuthGuard)
  @Post('product')
  async log(@Body() dto: LogEventDto, @GetUser('userId') userId?: string) {
    if (!dto.sessionId) {
      return { success: false, message: 'Missing sessionId' };
    }
    await this.events.logProductEvent({ ...dto, customerId: userId });
    return { success: true };
  }
}