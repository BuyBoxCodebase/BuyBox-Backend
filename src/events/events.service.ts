import { Injectable } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogUserEventInput {
  customerId?: string;
  sessionId: string;
  type: UserEventType;
  productId?: string;
  categoryId?: string;
  subcategoryId?: string;
  device?: string;
  platform?: string;
  source?: string;
  metadata?: any;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async logUserEvent(data: LogUserEventInput) {
    if (!data.subcategoryId && data.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { subCategoryId: true },
      });
      if (product?.subCategoryId) {
        data.subcategoryId = product.subCategoryId;
      }
    }
    return await this.prisma.userEvent.create({ data });
  }
}