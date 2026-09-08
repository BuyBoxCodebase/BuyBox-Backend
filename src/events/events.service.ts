import { Injectable } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogUserEventInput {
  customerId?: string;
  sessionId: string;
  type: UserEventType;
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

  async logUserEvent(data: LogUserEventInput) {
    if (!data.categoryId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { categoryId: true },
      });
      if (product?.categoryId) {
        data.categoryId = product.categoryId;
      }
    }
    return await this.prisma.userEvent.create({ data });
  }
}