import { Injectable } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface LogUserEventInput {
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
  createdAt?: Date;
}

@Injectable()
export class EventsService {
  constructor(private prisma: PrismaService) { }

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


  async logUserEvents(events: LogUserEventInput[]) {
    if (!events.length) return;

    const productIds = [...new Set(events.filter((e) => e.productId).map((e) => e.productId as string))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, categoryId: true, subCategoryId: true },
      })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    await this.prisma.userEvent.createMany({
      data: events.map((e) => {
        const product = e.productId ? byId.get(e.productId) : undefined;
        return {
          ...e,
          categoryId: e.categoryId ?? product?.categoryId ?? undefined,
          subCategoryId: e.subCategoryId ?? product?.subCategoryId ?? undefined,
        };
      }),
    });
  }
}