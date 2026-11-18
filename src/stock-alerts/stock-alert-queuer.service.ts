import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../whatsapp/whatsapp-format';
import { safely } from '../../libs/common/src';
import { variantKey } from './canonical-key';
import { StockAlertWorkerClient } from './stock-alert-worker.client';
import { loadVariantTarget } from './variant-target';

const DEFAULT_COUNTRY_CODE = '263';
const UNITS_MULTIPLIER = 3; // queue up to this many customers per unit in stock (not everyone sees stock and rushes)
const MAX_PER_AVAILABILITY = 20;

/**
 * Called straight after a stock or approval change, the same way search is reindexed. Queues an alert for each
 * waiting customer who should hear about it, then wakes the sending worker. Never throws: a
 * failed alert must not affect the seller's action.
 */
@Injectable()
export class StockAlertQueuer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: StockAlertWorkerClient,
  ) {}

  /** Variants that may have just become purchasable (approved, or restocked from zero). */
  async onAvailable(variantIds: string[]): Promise<void> {
    let queued = 0;
    for (const variantId of new Set(variantIds)) {
      queued += (await safely('StockAlertQueuer.queue', () => this.queueVariant(variantId), { variantId })) ?? 0;
    }
    // Wake the worker only when there is something new for it. Alerts held back by a daily budget go out on a
    // later ping.
    if (queued > 0) await safely('StockAlertQueuer.ping', () => this.worker.requestDrain());
  }

  private async queueVariant(variantId: string): Promise<number> {
    // Only an approved variant with stock counts; read live, not from the caller.
    const target = await loadVariantTarget(this.prisma, variantId);
    if (!target || !target.approved || target.stock <= 0) return 0;

    const key = variantKey(target.brand, target.name, target.colour, target.size);

    // An alert never reserves stock, so only a few customers per unit are told. Alerts already queued count.
    const alreadyQueued = await this.prisma.stockAlertDelivery.count({
      where: { variantKey: key, status: { in: ['PENDING', 'SENDING'] } },
    });
    const room = Math.min(target.stock * UNITS_MULTIPLIER, MAX_PER_AVAILABILITY) - alreadyQueued;
    if (room <= 0) return 0;

    // Oldest waiting first
    const waiting = await this.prisma.stockAlertSubscription.findMany({
      where: { variantKey: key, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take: room,
    });

    // No usable number: stays waiting until they add one (WhatsApp is the only channel for now)
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: waiting.map((entry) => entry.customerId) } },
      select: { id: true, phoneNumber: true },
    });
    const reachable = new Set(customers.filter((c) => normalizePhone(c.phoneNumber, DEFAULT_COUNTRY_CODE)).map((c) => c.id));

    let queued = 0;
    for (const entry of waiting) {
      if (!reachable.has(entry.customerId)) continue;
      // Claim the entry and queue its alert together: two overlapping stock changes can never queue the same
      // customer twice, and a claimed entry always has an alert.
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.stockAlertSubscription.updateMany({
          where: { id: entry.id, status: 'ACTIVE' },
          data: { status: 'QUEUED' },
        });
        if (claimed.count === 0) return;
        queued++;
        await tx.stockAlertDelivery.create({
          data: { subscriptionId: entry.id, customerId: entry.customerId, variantId, variantKey: key },
        });
      });
    }
    return queued;
  }
}
