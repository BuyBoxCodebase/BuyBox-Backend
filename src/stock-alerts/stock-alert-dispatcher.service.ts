import { Inject, Injectable, Logger } from '@nestjs/common';
import { StockAlertDelivery } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { logError } from '../../libs/common/src';
import {
  AlertChannelType,
  AlertRecipient,
  STOCK_ALERT_CHANNELS,
  StockAlertChannel,
} from './channels/stock-alert-channel';
import { loadVariantTarget } from './variant-target';

const SENDS_AT_ONCE = 5;
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5 * 60_000;
const STALE_CLAIM_MS = 5 * 60_000; // a dispatch run that died mid-send: its claims go back to the queue
const WINDOW_MS = 24 * 60 * 60_000; // channels count unique customers messaged in a rolling 24 hours

export interface DrainResult {
  sent: number;
  expired: number;
  failed: number;
  pendingLeft: number;
  budgetLeft: Record<string, number>;
}

type Outcome = 'sent' | 'expired' | 'retry' | 'failed' | 'skipped' | 'opted-out' | 'unavailable';

/**
 * Sends the queued stock alerts. Each customer is told on one channel: the first channel, in priority order, that can
 * reach them and still has room in its daily budget (only WhatsApp for now). Alerts nobody has room for wait for the
 * rolling 24 hours to free some. Oldest first. Runs when the backend pings the worker after queueing alerts. Safe to run
 * twice at once: every row is claimed before it is sent.
 */
@Injectable()
export class StockAlertDispatcher {
  private readonly logger = new Logger(StockAlertDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STOCK_ALERT_CHANNELS) private readonly allChannels: StockAlertChannel[],
  ) {}

  async drain(deadline: number): Promise<DrainResult> {
    const result: DrainResult = { sent: 0, expired: 0, failed: 0, pendingLeft: 0, budgetLeft: {} };
    const channels = this.allChannels.filter((channel) => channel.enabled());
    if (channels.length === 0) return result;

    await this.releaseStaleClaims();
    const messaged = await this.customersMessagedInWindow();
    const unavailable = new Set<AlertChannelType>(); // not working right now, e.g. template awaiting approval
    const blocked = new Set<string>(); // rows with no channel to go out on right now

    while (Date.now() < deadline) {
      const due = await this.prisma.stockAlertDelivery.findMany({
        where: { status: 'PENDING', availableAt: { lte: new Date() }, id: { notIn: [...blocked] } },
        orderBy: { createdAt: 'asc' },
        take: SENDS_AT_ONCE,
      });
      if (due.length === 0) break;

      const recipients = await this.loadRecipients(due.map((row) => row.customerId));
      const reservedInBatch = new Map<AlertChannelType, Set<string>>(channels.map((c) => [c.type, new Set<string>()]));
      const plan: { row: StockAlertDelivery; channel: StockAlertChannel; recipient: AlertRecipient }[] = [];

      for (const row of due) {
        const recipient = recipients.get(row.customerId);
        const reachable = recipient
          ? channels.filter((channel) => !row.skipChannels.includes(channel.type) && channel.canReach(recipient))
          : [];

        if (!recipient || reachable.length === 0) {
          // Refused everything we can reach them on, or there is nothing to reach them on.
          if (row.skipChannels.length > 0) await this.giveUp(row, 'OPTED_OUT');
          else await this.expire(row, true);
          result[row.skipChannels.length > 0 ? 'failed' : 'expired']++;
          continue;
        }

        const channel = reachable.find((candidate) => {
          if (unavailable.has(candidate.type)) return false;
          const done = messaged.get(candidate.type)!;
          const reserved = reservedInBatch.get(candidate.type)!;
          // A customer already messaged on this channel in the window costs nothing extra.
          return done.has(row.customerId) || reserved.has(row.customerId) || done.size + reserved.size < candidate.dailyBudget();
        });
        if (!channel) {
          blocked.add(row.id); // waits for budget, or for a broken channel to recover
          continue;
        }
        if (!messaged.get(channel.type)!.has(row.customerId)) reservedInBatch.get(channel.type)!.add(row.customerId);
        plan.push({ row, channel, recipient });
      }

      const outcomes = await Promise.all(plan.map(({ row, channel, recipient }) => this.process(row, channel, recipient)));
      outcomes.forEach((outcome, i) => {
        const { row, channel } = plan[i];
        if (outcome === 'sent') {
          result.sent++;
          messaged.get(channel.type)!.add(row.customerId);
        } else if (outcome === 'expired') result.expired++;
        else if (outcome === 'failed') result.failed++;
        else if (outcome === 'unavailable') unavailable.add(channel.type);
      });
    }

    for (const channel of channels) {
      result.budgetLeft[channel.type] = Math.max(0, channel.dailyBudget() - messaged.get(channel.type)!.size);
    }
    result.pendingLeft = await this.prisma.stockAlertDelivery.count({ where: { status: 'PENDING' } });
    return result;
  }

  // ---- one alert ---------------------------------------------------------------------------------

  private async process(row: StockAlertDelivery, channel: StockAlertChannel, recipient: AlertRecipient): Promise<Outcome> {
    // Claim first: only one run can send this row.
    const claimed = await this.prisma.stockAlertDelivery.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'SENDING', claimedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 0) return 'skipped';
    const attempts = row.attempts + 1;

    // Re-check everything now: the customer may have cancelled, or the product sold out while it waited.
    const subscription = await this.prisma.stockAlertSubscription.findUnique({ where: { id: row.subscriptionId } });
    if (!subscription || subscription.status !== 'QUEUED') return this.expire(row);

    const target = await loadVariantTarget(this.prisma, row.variantId);
    if (!target || !target.approved || target.stock <= 0) return this.expire(row, true);

    try {
      const providerMessageId = await channel.send({
        recipient,
        variantId: row.variantId,
        productName: target.name,
        size: target.size,
        price: target.price,
        image: target.image,
      });
      // Mark SENT first: it is what the daily budget counts.
      await this.prisma.stockAlertDelivery.update({
        where: { id: row.id },
        data: { status: 'SENT', channel: channel.type, sentAt: new Date(), providerMessageId, lastError: null },
      });
      await this.prisma.stockAlertSubscription.updateMany({
        where: { id: row.subscriptionId, status: 'QUEUED' },
        data: { status: 'NOTIFIED', notifiedAt: new Date() },
      });
      this.logger.log(`Stock alert: customer ${row.customerId} told "${subscription.displayName}" is available by ${channel.type} (${providerMessageId})`);
      return 'sent';
    } catch (error) {
      return this.handleSendError(row, channel, attempts, error);
    }
  }

  private async handleSendError(row: StockAlertDelivery, channel: StockAlertChannel, attempts: number, error: unknown): Promise<Outcome> {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    const failure = channel.classifyError(error);

    if (failure === 'opted-out') {
      // They refuse this channel: put the alert back, and the next run uses another one. Not an attempt.
      await this.prisma.stockAlertDelivery.update({
        where: { id: row.id },
        data: { status: 'PENDING', attempts: row.attempts, claimedAt: null, skipChannels: { push: channel.type }, lastError: message },
      });
      return 'opted-out';
    }

    if (failure === 'unavailable') {
      // The channel itself is not working (e.g. template not approved): keep the alert queued and warn, don't alert.
      await this.prisma.stockAlertDelivery.update({
        where: { id: row.id },
        data: { status: 'PENDING', attempts: row.attempts, claimedAt: null, lastError: message },
      });
      this.logger.warn(`Stock alert channel ${channel.type} is not available right now: ${message}`);
      return 'unavailable';
    }

    await logError(error, {
      context: `StockAlertDispatcher: ${channel.type}`,
      extra: { deliveryId: row.id, customerId: row.customerId, variantId: row.variantId, attempts },
    });

    if (attempts >= MAX_ATTEMPTS) {
      await this.giveUp(row, 'ACTIVE', message); // the customer goes back to waiting so the next restock includes them
      return 'failed';
    }
    await this.prisma.stockAlertDelivery.update({
      where: { id: row.id },
      data: { status: 'PENDING', claimedAt: null, availableAt: new Date(Date.now() + attempts * RETRY_BACKOFF_MS), lastError: message },
    });
    return 'retry';
  }

  // Not sent, and not worth sending any more. `resumeWatching` puts a still-queued customer back to waiting.
  private async expire(row: StockAlertDelivery, resumeWatching = false): Promise<Outcome> {
    await this.prisma.stockAlertDelivery.update({ where: { id: row.id }, data: { status: 'EXPIRED' } });
    if (resumeWatching) {
      await this.prisma.stockAlertSubscription.updateMany({ where: { id: row.subscriptionId, status: 'QUEUED' }, data: { status: 'ACTIVE' } });
    }
    return 'expired';
  }

  private async giveUp(row: StockAlertDelivery, subscriptionStatus: 'ACTIVE' | 'OPTED_OUT', lastError?: string): Promise<void> {
    await this.prisma.stockAlertDelivery.update({ where: { id: row.id }, data: { status: 'FAILED', ...(lastError && { lastError }) } });
    await this.prisma.stockAlertSubscription.updateMany({
      where: { id: row.subscriptionId, status: 'QUEUED' },
      data: { status: subscriptionStatus, ...(subscriptionStatus === 'OPTED_OUT' && { optedOutAt: new Date() }) },
    });
  }

  // ---- budget and housekeeping ---------------------------------------------------------------------

  // Unique customers already messaged in the last 24 hours, per channel.
  private async customersMessagedInWindow(): Promise<Map<AlertChannelType, Set<string>>> {
    const sent = new Map<AlertChannelType, Set<string>>(this.allChannels.map((c) => [c.type, new Set<string>()]));
    const rows = await this.prisma.stockAlertDelivery.findMany({
      where: { status: 'SENT', sentAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      select: { channel: true, customerId: true },
      distinct: ['channel', 'customerId'],
    });
    for (const row of rows) if (row.channel) sent.get(row.channel)?.add(row.customerId);
    return sent;
  }

  // Contact details come from the customer's profile as it is now.
  private async loadRecipients(customerIds: string[]): Promise<Map<string, AlertRecipient>> {
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: [...new Set(customerIds)] } },
      select: { id: true, name: true, email: true, phoneNumber: true },
    });
    return new Map(customers.map((c) => [c.id, { name: c.name, email: c.email, phoneNumber: c.phoneNumber }]));
  }

  private async releaseStaleClaims(): Promise<void> {
    await this.prisma.stockAlertDelivery.updateMany({
      where: { status: 'SENDING', claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      data: { status: 'PENDING', claimedAt: null },
    });
  }
}
