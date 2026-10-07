import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityEventType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { normalizeRoute } from './route';

const MAX_EVENTS_PER_BATCH = 50;
const MAX_METADATA_CHARS = 2000;
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

const ACTIVE_SESSION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
const CLIENT_EVENT_TYPES = new Set<ActivityEventType>([
  ActivityEventType.PAGE_VIEW,
  ActivityEventType.CLICK,
  ActivityEventType.SEARCH,
  ActivityEventType.ADD_TO_CART,
  ActivityEventType.CHECKOUT_STARTED,
  ActivityEventType.LOGIN,
  ActivityEventType.LOGOUT,
]);

export interface ActivityBatchDto {
  sessionId: string;
  visitorId: string;
  context?: {
    referrer?: string;
    device?: string;
    platform?: string;
    browser?: string;
  };
  events?: {
    type: ActivityEventType;
    seq?: number;
    ts?: number;
    path: string;
    title?: string;
    label?: string;
    productId?: string;
    metadata?: Record<string, unknown>;
  }[];
}

export interface SessionListQuery {
  from?: string;
  to?: string;
  audience?: 'customer' | 'guest';
  converted?: string;
  customerId?: string;
  page?: string;
  limit?: string;
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  // ─── Ingest ────────────────────────────────────────────────────────────────

  async ingestBatch(dto: ActivityBatchDto, customerId?: string) {
    if (!UUID_RE.test(dto?.sessionId ?? '') || !UUID_RE.test(dto?.visitorId ?? '')) {
      throw new BadRequestException('Invalid sessionId or visitorId');
    }
    const rawEvents = Array.isArray(dto.events) ? dto.events : [];
    if (rawEvents.length > MAX_EVENTS_PER_BATCH) {
      throw new BadRequestException(`At most ${MAX_EVENTS_PER_BATCH} events per batch`);
    }

    const now = Date.now();
    const events: Prisma.ActivityEventCreateManyInput[] = [];
    for (const e of rawEvents) {
      if (!e || !CLIENT_EVENT_TYPES.has(e.type)) continue;
      const path = str(e.path, 500);
      if (!path) continue;

      let ts = typeof e.ts === 'number' && Number.isFinite(e.ts) ? e.ts : now;
      if (ts > now || now - ts > MAX_CLOCK_SKEW_MS) ts = now;

      let metadata: Prisma.InputJsonValue | undefined;
      if (e.metadata && typeof e.metadata === 'object') {
        const json = JSON.stringify(e.metadata);
        if (json.length <= MAX_METADATA_CHARS) metadata = JSON.parse(json);
      }

      events.push({
        sessionId: dto.sessionId,
        visitorId: dto.visitorId,
        customerId: customerId ?? null,
        seq: Number.isInteger(e.seq) && e.seq >= 0 && e.seq <= 2_147_483_647 ? e.seq : 0,
        type: e.type,
        path,
        route: normalizeRoute(path),
        pageTitle: str(e.title, 200),
        label: str(e.label, 120),
        productId: OBJECT_ID_RE.test(e.productId ?? '') ? e.productId : null,
        metadata,
        occurredAt: new Date(ts),
      });
    }

    await this.upsertSession(dto, events, customerId, now);
    if (events.length) {
      await this.prisma.activityEvent.createMany({ data: events });
    }
    return { success: true, accepted: events.length };
  }

  private async upsertSession(
    dto: ActivityBatchDto,
    events: Prisma.ActivityEventCreateManyInput[],
    customerId: string | undefined,
    now: number,
  ) {
    const lit = (v: unknown) => ({ $literal: v ?? null });
    const date = (ms: number) => ({ $date: new Date(ms).toISOString() });
    const keep = (field: string, fallback: unknown) => ({ $ifNull: [`$${field}`, lit(fallback)] });

    const times = events.map((e) => (e.occurredAt as Date).getTime());
    const firstTs = times.length ? Math.min(...times) : now;
    const pageViews = events.filter((e) => e.type === ActivityEventType.PAGE_VIEW);
    const ctx = dto.context ?? {};

    const set: Record<string, unknown> = {
      visitorId: keep('visitorId', dto.visitorId),
      startedAt: { $min: [{ $ifNull: ['$startedAt', date(firstTs)] }, date(firstTs)] },
      lastSeenAt: { $max: [{ $ifNull: ['$lastSeenAt', date(now)] }, date(now)] },
      entryPath: keep('entryPath', pageViews[0]?.path ?? events[0]?.path),
      exitPath: pageViews.length ? lit(pageViews[pageViews.length - 1].path) : '$exitPath',
      entryRoute: keep('entryRoute', pageViews[0]?.route ?? events[0]?.route),
      exitRoute: pageViews.length ? lit(pageViews[pageViews.length - 1].route) : '$exitRoute',
      referrer: keep('referrer', str(ctx.referrer, 500)),
      device: keep('device', str(ctx.device, 40)),
      platform: keep('platform', str(ctx.platform, 40)),
      browser: keep('browser', str(ctx.browser, 40)),
      pageCount: { $add: [{ $ifNull: ['$pageCount', 0] }, pageViews.length] },
      eventCount: { $add: [{ $ifNull: ['$eventCount', 0] }, events.length] },
      converted: { $ifNull: ['$converted', false] },
      createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
      updatedAt: '$$NOW',
    };
    
    set.customerId = customerId ? { $oid: customerId } : { $ifNull: ['$customerId', null] };

    await this.prisma.$runCommandRaw({
      update: 'AnalyticsSession',
      updates: [
        {
          q: { sessionId: dto.sessionId },
          u: [
            { $set: set },
            {
              $set: {
                durationSec: {
                  $toInt: { $floor: { $divide: [{ $subtract: ['$lastSeenAt', '$startedAt'] }, 1000] } },
                },
              },
            },
          ],
          upsert: true,
        },
      ],
    } as Prisma.InputJsonObject);
  }

  async recordOrderPlaced(customerId: string, orderId: string, totalAmount: number) {
    const session = await this.prisma.analyticsSession.findFirst({
      where: {
        customerId,
        lastSeenAt: { gte: new Date(Date.now() - ACTIVE_SESSION_WINDOW_MS) },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!session) return;

    const now = new Date();
    const path = session.exitPath ?? '/checkout';
    await this.prisma.$transaction([
      this.prisma.activityEvent.create({
        data: {
          sessionId: session.sessionId,
          visitorId: session.visitorId,
          customerId,
          seq: 0, // ordering uses occurredAt first; seq only breaks ties
          type: ActivityEventType.ORDER_PLACED,
          path,
          route: normalizeRoute(path),
          label: `Order #${orderId}`,
          metadata: { orderId, totalAmount },
          occurredAt: now,
        },
      }),
      this.prisma.analyticsSession.update({
        where: { id: session.id },
        data: {
          converted: true,
          eventCount: { increment: 1 },
          lastSeenAt: now,
          durationSec: Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
        },
      }),
    ]);
  }


  async listSessions(query: SessionListQuery) {
    const page = Math.max(1, parseInt(query.page ?? '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20') || 20));

    const where: Prisma.AnalyticsSessionWhereInput = {};
    const startedAt: Prisma.DateTimeFilter = {};
    if (query.from && !isNaN(Date.parse(query.from))) startedAt.gte = new Date(query.from);
    if (query.to && !isNaN(Date.parse(query.to))) startedAt.lte = new Date(query.to);
    if (Object.keys(startedAt).length) where.startedAt = startedAt;
    if (query.customerId && OBJECT_ID_RE.test(query.customerId)) {
      where.customerId = query.customerId;
    } else if (query.audience === 'customer') {
      where.customerId = { not: null };
    } else if (query.audience === 'guest') {
      where.customerId = null;
    }
    if (query.converted === 'true') where.converted = true;
    if (query.converted === 'false') where.converted = false;

    const [total, sessions] = await this.prisma.$transaction([
      this.prisma.analyticsSession.count({ where }),
      this.prisma.analyticsSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const customers = await this.customersById(sessions.map((s) => s.customerId));
    return {
      sessions: sessions.map((s) => ({
        ...s,
        customer: s.customerId ? customers.get(s.customerId) ?? null : null,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSessionTimeline(sessionId: string) {
    const session = await this.prisma.analyticsSession.findUnique({ where: { sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const events = await this.prisma.activityEvent.findMany({
      where: { sessionId },
      orderBy: [{ occurredAt: 'asc' }, { seq: 'asc' }],
      take: 2000,
    });

    const productIds = [...new Set(events.map((e) => e.productId).filter(Boolean))];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNames = new Map(products.map((p) => [p.id, p.name]));
    const customers = await this.customersById([session.customerId]);

    
    const pageViewIdx = events.flatMap((e, i) => (e.type === ActivityEventType.PAGE_VIEW ? [i] : []));
    const timeOnPage = new Map<number, number>();
    pageViewIdx.forEach((idx, n) => {
      const start = events[idx].occurredAt.getTime();
      const end =
        n + 1 < pageViewIdx.length
          ? events[pageViewIdx[n + 1]].occurredAt.getTime()
          : session.lastSeenAt.getTime();
      timeOnPage.set(idx, Math.max(0, end - start));
    });

    return {
      session: {
        ...session,
        customer: session.customerId ? customers.get(session.customerId) ?? null : null,
      },
      events: events.map((e, i) => ({
        id: e.id,
        type: e.type,
        path: e.path,
        pageTitle: e.pageTitle,
        label: e.label,
        productId: e.productId,
        productName: e.productId ? productNames.get(e.productId) ?? null : null,
        metadata: e.metadata,
        occurredAt: e.occurredAt,
        timeOnPageMs: timeOnPage.get(i) ?? null,
      })),
    };
  }

  private async customersById(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    const customers = unique.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: unique } },
          select: { id: true, name: true, email: true, profilePic: true },
        })
      : [];
    return new Map(customers.map((c) => [c.id, c]));
  }
}
