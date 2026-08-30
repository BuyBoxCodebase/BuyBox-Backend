import { Injectable } from '@nestjs/common';
import { ProductEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogProductEventInput {
  customerId?: string;
  sessionId: string;
  type: ProductEventType;
  productId?: string;
  categoryId?: string;
  device?: string;
  platform?: string;
  source?: string;
  metadata?: any;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async logProductEvent(data: LogProductEventInput) {
    if (!data.categoryId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { categoryId: true },
      });
      if (product?.categoryId) {
        data.categoryId = product.categoryId;
      }
    }
    return await this.prisma.productEvent.create({ data });
  }
}