import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_DAILY_BUCKET_DAYS = 62;

function parseDay(value: string | undefined, name: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) {
    throw new BadRequestException(`${name} must be a date in YYYY-MM-DD format`);
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new BadRequestException(`${name} is not a valid date`);
  }
  return date;
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AdminControlService {
  constructor(private prisma: PrismaService) { }

  async getDashboard(startParam?: string, endParam?: string) {
    const start = parseDay(startParam, 'start');
    const endInclusive = parseDay(endParam, 'end');
    if (endInclusive < start) {
      throw new BadRequestException('end must be on or after start');
    }
    const end = new Date(endInclusive.getTime() + DAY_MS); // exclusive
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    const prevStart = new Date(start.getTime() - days * DAY_MS);

    const inRange = { gte: start, lt: end };
    const inPrevRange = { gte: prevStart, lt: start };

    const [
      completedOrders,
      prevGmv,
      orders,
      prevOrders,
      totalSellers,
      newSellers,
      prevNewSellers,
      pendingInRange,
      pendingTotal,
      recent,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: OrderStatus.COMPLETED, createdAt: inRange },
        select: { createdAt: true, totalAmount: true },
      }),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.COMPLETED, createdAt: inPrevRange },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.count({ where: { createdAt: inRange } }),
      this.prisma.order.count({ where: { createdAt: inPrevRange } }),
      this.prisma.seller.count(),
      this.prisma.seller.count({ where: { createdAt: inRange } }),
      this.prisma.seller.count({ where: { createdAt: inPrevRange } }),
      this.prisma.order.count({
        where: { status: OrderStatus.PENDING, createdAt: inRange },
      }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.order.findMany({
        where: { status: OrderStatus.COMPLETED, createdAt: inRange },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          email: true,
          totalAmount: true,
          createdAt: true,
          user: { select: { name: true, email: true, profilePic: true } },
        },
      }),
    ]);

    const bucket: 'day' | 'month' = days <= MAX_DAILY_BUCKET_DAYS ? 'day' : 'month';
    const keyOf = (date: Date) =>
      bucket === 'day' ? toDay(date) : toDay(date).slice(0, 7);
    const points = new Map<string, { key: string; label: string; gmv: number; orders: number }>();
    if (bucket === 'day') {
      for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
        const d = new Date(t);
        points.set(keyOf(d), {
          key: keyOf(d),
          label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`,
          gmv: 0,
          orders: 0,
        });
      }
    } else {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      while (d < end) {
        points.set(keyOf(d), {
          key: keyOf(d),
          label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
          gmv: 0,
          orders: 0,
        });
        d.setUTCMonth(d.getUTCMonth() + 1);
      }
    }

    let gmv = 0;
    for (const order of completedOrders) {
      gmv += order.totalAmount;
      const point = points.get(keyOf(order.createdAt));
      if (point) {
        point.gmv += order.totalAmount;
        point.orders += 1;
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    return {
      range: {
        start: toDay(start),
        end: toDay(endInclusive),
        days,
        previousStart: toDay(prevStart),
        previousEnd: toDay(new Date(start.getTime() - DAY_MS)),
      },
      gmv: {
        value: round(gmv),
        previous: round(prevGmv._sum.totalAmount ?? 0),
        completedOrders: completedOrders.length,
      },
      orders: { value: orders, previous: prevOrders },
      sellers: { total: totalSellers, new: newSellers, previousNew: prevNewSellers },
      pendingOrders: { inRange: pendingInRange, total: pendingTotal },
      chart: {
        bucket,
        points: [...points.values()].map((p) => ({ ...p, gmv: round(p.gmv) })),
      },
      recentSales: recent.map((order) => ({
        id: order.id,
        name: order.user?.name ?? order.email,
        email: order.user?.email ?? order.email,
        profilePic: order.user?.profilePic ?? null,
        amount: round(order.totalAmount),
        createdAt: order.createdAt,
      })),
    };
  }

  async getAllAdmins() {
    const admins = await this.prisma.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        profilePic: true,
        role: true,
        createdAt: true,
        isVerified: true,
      },
    });
    return admins;
  }

  async getAllSellers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [sellers, total] = await Promise.all([
      this.prisma.seller.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          profilePic: true,
          phoneNumber: true,
          isCompleted: true,
          createdAt: true,
          brandPic: true,
          description: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.seller.count(),
    ]);

    return {
      data: sellers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getAllCustomers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        omit: {
          password: true,
          googleId: true,
          facebookId: true,
          username: true,
          updatedAt: true,
        },
      }),
      this.prisma.customer.count(),
    ]);

    return {
      data: customers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getAllDeliveryAgents(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [deliveryAgents, total] = await Promise.all([
      this.prisma.deliveryAgent.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.deliveryAgent.count(),
    ]);

    return {
      data: deliveryAgents,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async getAllOrders(page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          products: {
            select: {
              product: {
                select: {
                  seller: {
                    select: {
                      name: true,
                      phoneNumber: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.order.count(),
    ]);

    return {
      data: orders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  async assignOrderToDeliveryAgent(orderId: string, deliveryAgentId: string) {
    const order = await this.prisma.$transaction(async (prisma) => {
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          deliveryAgentId,
          status: OrderStatus.PROCESSING,
        },
      });
      await prisma.deliveryAgent.update({
        where: {
          id: deliveryAgentId,
        },
        data: {
          isAssigned: true,
        },
      });
      return updatedOrder;
    });

    return order;
  }

  async grantAdmin(userId: string) {
    const admin = await this.prisma.admin.update({
      where: { id: userId },
      data: {
        isVerified: true,
      },
    });

    return admin;
  }

  async revokeAdmin(userId: string) {
    const admin = await this.prisma.admin.update({
      where: { id: userId },
      data: {
        isVerified: false,
      },
    });

    return admin;
  }
}
