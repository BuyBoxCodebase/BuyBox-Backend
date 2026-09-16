import { Injectable } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface LogUserEventInput {
  customerId?: string;
  sessionId: string;
  type: UserEventType;
  productId?: string;
  categoryId?: string;
  subCategoryId?: string;
  device?: string;
  platform?: string;
  source?: string;
  metadata?: any;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) {}

  async logUserEvent(data: LogUserEventInput) {
    if ((!data.subCategoryId || !data.categoryId) && data.productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: data.productId },
        select: { subCategoryId: true, categoryId: true },
      });
      if (!data.subCategoryId && product?.subCategoryId) {
        data.subCategoryId = product.subCategoryId;
      }
      if (!data.categoryId && product?.categoryId) {
        data.categoryId = product.categoryId;
      }
    }
    return await this.prisma.userEvent.create({ data });
  }
}