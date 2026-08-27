import { Injectable } from '@nestjs/common';
import { ProductEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogProductEventInput {
  customerId: string;
  productId: string;
  categoryId?: string;
  type: ProductEventType;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  logProductEvent(data: LogProductEventInput) {
    return this.prisma.productEvent.create({ data });
  }
}