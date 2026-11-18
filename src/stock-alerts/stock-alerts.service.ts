import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StockAlertStatus, StockAlertSubscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../whatsapp/whatsapp-format';
import { variantKey } from './canonical-key';
import { loadVariantTarget } from './variant-target';

const DEFAULT_COUNTRY_CODE = '263';
const MAX_ACTIVE_SUBSCRIPTIONS = 50;
// Still waiting for an alert: either not available yet, or available with the alert queued behind a daily budget.
const WATCHING: StockAlertStatus[] = ['ACTIVE', 'QUEUED'];

// A stock alert request names the product variant the customer is looking at.
export interface StockAlertTargetInput {
  variantId?: string;
}

export type CreateStockAlertInput = StockAlertTargetInput;

// Who is asking. Comes from the JWT strategy (the customer record).
export interface StockAlertCustomer {
  userId: string;
  phoneNumber?: string | null;
}

// The variant the customer wants, in plain words.
interface DescribedTarget {
  brand: string | null;
  name: string;
  colour: string | null;
  size: string | null;
  displayName: string;
  sourceVariantId: string | null;
}

@Injectable()
export class StockAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- subscribe / read / cancel ------------------------------------------------------------

  async create(customer: StockAlertCustomer, input: CreateStockAlertInput) {
    // WhatsApp is the only channel for now, so a usable phone number is required. The website sends the customer to
    // their profile to add one, then back here.
    if (!normalizePhone(customer.phoneNumber, DEFAULT_COUNTRY_CODE)) {
      throw new ConflictException({
        statusCode: 409,
        code: "PHONE_REQUIRED",
        message: "Add your WhatsApp number to your profile so we can message you when it is available.",
      });
    }

    const customerId = customer.userId;
    const described = await this.describeVariant(input.variantId);
    const key = variantKey(described.brand, described.name, described.colour, described.size);

    const existing = await this.prisma.stockAlertSubscription.findUnique({
      where: { customerId_variantKey: { customerId, variantKey: key } },
    });
    // Already waiting: asking again is not an error.
    if (existing && WATCHING.includes(existing.status)) return { created: false, subscription: toDto(existing) };

    const activeCount = await this.prisma.stockAlertSubscription.count({ where: { customerId, status: { in: WATCHING } } });
    if (activeCount >= MAX_ACTIVE_SUBSCRIPTIONS) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'LIMIT_REACHED',
        message: `You can have up to ${MAX_ACTIVE_SUBSCRIPTIONS} active alerts. Cancel one to add another.`,
      });
    }

    const data = {
      brand: described.brand,
      name: described.name,
      displayName: described.displayName,
      sourceVariantId: described.sourceVariantId,
      status: 'ACTIVE' as const,
      notifiedAt: null,
      cancelledAt: null,
      optedOutAt: null,
    };

    try {
      // A notified, cancelled or opted-out entry is reused: one row per customer and product.
      const saved = existing
        ? await this.prisma.stockAlertSubscription.update({ where: { id: existing.id }, data })
        : await this.prisma.stockAlertSubscription.create({ data: { customerId, variantKey: key, ...data } });
      return { created: true, subscription: toDto(saved) };
    } catch (error) {
      // Two quick taps: the other request won. Return theirs.
      if (isDuplicateKey(error)) {
        const winner = await this.prisma.stockAlertSubscription.findUnique({
          where: { customerId_variantKey: { customerId, variantKey: key } },
        });
        if (winner) return { created: false, subscription: toDto(winner) };
      }
      throw error;
    }
  }

  // The customer's active alerts, newest first.
  async list(customerId: string) {
    const rows = await this.prisma.stockAlertSubscription.findMany({
      where: { customerId, status: { in: WATCHING } },
      orderBy: { createdAt: 'desc' },
    });
    return { subscriptions: rows.map(toDto) };
  }

  // Is the customer already watching this? Lets the Notify me button show "You'll be notified" up front.
  async status(customerId: string, input: StockAlertTargetInput) {
    const described = await this.describeVariant(input.variantId);
    const subscription = await this.prisma.stockAlertSubscription.findFirst({
      where: {
        customerId,
        variantKey: variantKey(described.brand, described.name, described.colour, described.size),
        status: { in: WATCHING },
      },
    });
    return { subscribed: !!subscription, subscriptionId: subscription?.id ?? null };
  }

  // Cancelling twice is fine. Someone else's alert looks the same as one that doesn't exist.
  async cancel(customerId: string, subscriptionId: string) {
    if (!/^[0-9a-fA-F]{24}$/.test(subscriptionId)) throw new NotFoundException('Alert not found');

    const result = await this.prisma.stockAlertSubscription.updateMany({
      where: { id: subscriptionId, customerId, status: { in: WATCHING } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.stockAlertSubscription.findFirst({ where: { id: subscriptionId, customerId }, select: { id: true } });
      if (!exists) throw new NotFoundException('Alert not found');
    }
    // Drop any message still waiting in the outbox, so it can't go out later (or twice if they subscribe again).
    await this.prisma.stockAlertDelivery.updateMany({
      where: { subscriptionId, customerId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    return { success: true };
  }

  async cancelAll(customerId: string) {
    const result = await this.prisma.stockAlertSubscription.updateMany({
      where: { customerId, status: { in: WATCHING } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    await this.prisma.stockAlertDelivery.updateMany({
      where: { customerId, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    return { success: true, cancelled: result.count };
  }

  // The number alerts would be sent to. Lets the website ask for one before the customer subscribes.
  settings(customer: StockAlertCustomer) {
    return {
      phoneNumber: customer.phoneNumber ?? null,
      hasValidPhone: !!normalizePhone(customer.phoneNumber, DEFAULT_COUNTRY_CODE),
    };
  }

  // ---- reading the variant the customer wants ---------------------------------

  // Take everything from the catalogue so it matches what sellers list.
  private async describeVariant(variantId: string | undefined): Promise<DescribedTarget> {
    if (!variantId) throw new BadRequestException('Invalid product variant');
    const target = await loadVariantTarget(this.prisma, variantId);
    if (!target) throw new NotFoundException('Product not found');

    return {
      brand: target.brand,
      name: target.name,
      colour: target.colour,
      size: target.size,
      displayName: [target.name, target.size && `Size ${target.size}`, target.colour].filter(Boolean).join(' · '),
      sourceVariantId: target.variantId,
    };
  }
}

// ---- helpers ------------------------------------------------------------------------------

function toDto(row: StockAlertSubscription) {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    sourceVariantId: row.sourceVariantId,
    createdAt: row.createdAt,
    notifiedAt: row.notifiedAt,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
