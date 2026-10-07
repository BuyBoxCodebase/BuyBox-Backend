import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_MS = 90 * DAY_MS; // raw events expire after 90 days anyway
const TOP_N = 10;

export interface JourneyQuery {
  from?: string;
  to?: string;
}

type Doc = Record<string, any>;

// aggregateRaw returns extended JSON, so numbers can arrive wrapped.
function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const v = value as Doc;
    const wrapped = v.$numberLong ?? v.$numberInt ?? v.$numberDouble ?? v.$numberDecimal;
    if (wrapped !== undefined) return Number(wrapped);
  }
  return 0;
}

function rate(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0; // one-decimal percentage
}

// Step flags per session. Defined as aggregation expressions over one event.
const isPageView = (route: string) => ({
  $and: [{ $eq: ['$type', 'PAGE_VIEW'] }, { $eq: ['$route', route] }],
});
const flag = (expr: unknown) => ({ $max: { $cond: [expr, 1, 0] } });

@Injectable()
export class JourneyService {
  constructor(private prisma: PrismaService) {}

  async getOverview(query: JourneyQuery) {
    const now = Date.now();
    let to = query.to && !isNaN(Date.parse(query.to)) ? Date.parse(query.to) : now;
    to = Math.min(to, now);
    let from = query.from && !isNaN(Date.parse(query.from)) ? Date.parse(query.from) : to - 7 * DAY_MS;
    from = Math.max(from, to - MAX_RANGE_MS);

    const range = {
      $gte: { $date: new Date(from).toISOString() },
      $lte: { $date: new Date(to).toISOString() },
    };

    const [sessionFacets, funnel, topPages, transitions] = await Promise.all([
      this.sessionFacets(range),
      this.funnel(range),
      this.topPages(range),
      this.transitions(range),
    ]);

    return {
      range: { from: new Date(from), to: new Date(to) },
      ...sessionFacets,
      funnel,
      topPages,
      transitions,
    };
  }

  // Summary numbers plus top entry and exit pages, all from AnalyticsSession.
  private async sessionFacets(range: Doc) {
    const bounced = { $cond: [{ $lte: ['$pageCount', 1] }, 1, 0] };
    const converted = { $cond: ['$converted', 1, 0] };

    const [result] = (await this.prisma.analyticsSession.aggregateRaw({
      pipeline: [
        { $match: { startedAt: range } },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  sessions: { $sum: 1 },
                  loggedIn: {
                    $sum: { $cond: [{ $ne: [{ $ifNull: ['$customerId', null] }, null] }, 1, 0] },
                  },
                  converted: { $sum: converted },
                  bounces: { $sum: bounced },
                  avgDurationSec: { $avg: '$durationSec' },
                  avgPages: { $avg: '$pageCount' },
                },
              },
            ],
            entryPages: [
              { $match: { entryRoute: { $type: 'string' } } },
              {
                $group: {
                  _id: '$entryRoute',
                  sessions: { $sum: 1 },
                  bounces: { $sum: bounced },
                  converted: { $sum: converted },
                },
              },
              { $sort: { sessions: -1 } },
              { $limit: TOP_N },
            ],
            exitPages: [
              { $match: { exitRoute: { $type: 'string' } } },
              { $group: { _id: '$exitRoute', sessions: { $sum: 1 } } },
              { $sort: { sessions: -1 } },
              { $limit: TOP_N },
            ],
          },
        },
      ] as Prisma.InputJsonValue[],
    })) as unknown as Doc[];

    const s = result?.summary?.[0] ?? {};
    const sessions = num(s.sessions);
    return {
      summary: {
        sessions,
        loggedInSessions: num(s.loggedIn),
        convertedSessions: num(s.converted),
        conversionRate: rate(num(s.converted), sessions),
        bounceRate: rate(num(s.bounces), sessions),
        avgDurationSec: Math.round(num(s.avgDurationSec)),
        avgPages: Math.round(num(s.avgPages) * 10) / 10,
      },
      entryPages: (result?.entryPages ?? []).map((p: Doc) => ({
        route: p._id as string,
        sessions: num(p.sessions),
        bounceRate: rate(num(p.bounces), num(p.sessions)),
        conversionRate: rate(num(p.converted), num(p.sessions)),
      })),
      exitPages: (result?.exitPages ?? []).map((p: Doc) => ({
        route: p._id as string,
        sessions: num(p.sessions),
      })),
    };
  }

  private async funnel(range: Doc) {
    const [row] = (await this.prisma.activityEvent.aggregateRaw({
      pipeline: [
        {
          $match: {
            occurredAt: range,
            type: { $in: ['PAGE_VIEW', 'ADD_TO_CART', 'CHECKOUT_STARTED', 'ORDER_PLACED'] },
          },
        },
        {
          $group: {
            _id: '$sessionId',
            visited: flag({ $eq: ['$type', 'PAGE_VIEW'] }),
            product: flag(isPageView('/product/:id')),
            cart: flag({ $or: [{ $eq: ['$type', 'ADD_TO_CART'] }, isPageView('/cart')] }),
            checkout: flag({ $or: [{ $eq: ['$type', 'CHECKOUT_STARTED'] }, isPageView('/checkout')] }),
            ordered: flag({ $eq: ['$type', 'ORDER_PLACED'] }),
          },
        },
        {
          $project: {
            visited: 1,
            product: { $min: ['$visited', '$product'] },
            cart: { $min: ['$visited', '$product', '$cart'] },
            checkout: { $min: ['$visited', '$product', '$cart', '$checkout'] },
            ordered: { $min: ['$visited', '$product', '$cart', '$checkout', '$ordered'] },
          },
        },
        {
          $group: {
            _id: null,
            visited: { $sum: '$visited' },
            product: { $sum: '$product' },
            cart: { $sum: '$cart' },
            checkout: { $sum: '$checkout' },
            ordered: { $sum: '$ordered' },
          },
        },
      ] as Prisma.InputJsonValue[],
      options: { allowDiskUse: true },
    })) as unknown as Doc[];

    const steps = [
      { key: 'visited', label: 'Visited the site' },
      { key: 'product', label: 'Viewed a product' },
      { key: 'cart', label: 'Added to / viewed cart' },
      { key: 'checkout', label: 'Started checkout' },
      { key: 'ordered', label: 'Placed an order' },
    ];
    const first = num(row?.visited);
    return steps.map((step, i) => {
      const sessions = num(row?.[step.key]);
      const previous = i === 0 ? sessions : num(row?.[steps[i - 1].key]);
      return {
        ...step,
        sessions,
        percentOfStart: rate(sessions, first),
        percentOfPrevious: rate(sessions, previous),
      };
    });
  }

  private async topPages(range: Doc) {
    const rows = (await this.prisma.activityEvent.aggregateRaw({
      pipeline: [
        { $match: { type: 'PAGE_VIEW', occurredAt: range, route: { $type: 'string' } } },
        { $group: { _id: { route: '$route', sessionId: '$sessionId' }, views: { $sum: 1 } } },
        { $group: { _id: '$_id.route', views: { $sum: '$views' }, sessions: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: TOP_N },
      ] as Prisma.InputJsonValue[],
      options: { allowDiskUse: true },
    })) as unknown as Doc[];

    return rows.map((r) => ({ route: r._id as string, views: num(r.views), sessions: num(r.sessions) }));
  }

  private async transitions(range: Doc) {
    const rows = (await this.prisma.activityEvent.aggregateRaw({
      pipeline: [
        { $match: { type: 'PAGE_VIEW', occurredAt: range, route: { $type: 'string' } } },
        {
          $setWindowFields: {
            partitionBy: '$sessionId',
            sortBy: { occurredAt: 1 },
            output: { next: { $shift: { output: '$route', by: 1, default: null } } },
          },
        },
        { $match: { next: { $type: 'string' }, $expr: { $ne: ['$route', '$next'] } } },
        { $group: { _id: { from: '$route', to: '$next' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ] as Prisma.InputJsonValue[],
      options: { allowDiskUse: true },
    })) as unknown as Doc[];

    return rows.map((r) => ({ from: r._id.from as string, to: r._id.to as string, count: num(r.count) }));
  }
}
