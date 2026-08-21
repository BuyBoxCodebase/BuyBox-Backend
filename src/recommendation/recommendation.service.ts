import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Scoring weights. Ordering matters more than the exact values:
 * explicit interests beat inferred affinity, personal signals beat global popularity.
 */
const WEIGHTS = {
  interest: 3.0,   // category is in Customer.interests
  category: 2.5,   // share of this user's past orders in that category
  cart: 1.5,       // matches what is in their cart right now
  popularity: 1.0, // global order count, normalised
  freshness: 0.5,  // new arrivals, decaying over FRESH_WINDOW_DAYS
};

const FRESH_WINDOW_DAYS = 30;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SIMILAR_PRICE_BAND = 0.3; // +/- 30%
const MIN_PER_CATEGORY = 3;     // floor, so diversity never starves a narrow feed

/** Product names carrying these markers never get recommended. */
const EXCLUDE_NAME_PATTERNS = [/^\s*\[TEST\]/i, /\btest product\b/i];

type ScoredProduct = { product: any; score: number; reasons: string[] };

@Injectable()
export class RecommendationService {
  constructor(private prisma: PrismaService) { }

  // popularity is global and changes slowly — cache it rather than
  // re-aggregating OrderProduct on every request
  private popularityCache: { at: number; map: Record<string, number>; max: number } | null = null;
  private catalogCache: { at: number; items: any[] } | null = null;

  /** Whole catalogue, shaped and in-stock-filtered. Cached — it changes far slower than requests arrive. */
  private async getCatalog() {
    if (this.catalogCache && Date.now() - this.catalogCache.at < CACHE_TTL_MS) {
      return this.catalogCache.items;
    }
    const raw = await this.prisma.product.findMany({ include: this.productInclude() });
    const items = raw
      .map((r) => ({ shaped: this.shape(r), createdAt: r.createdAt, subCategoryId: r.subCategoryId, brandId: r.brandId }))
      .filter((x) => this.inStock(x.shaped));
    this.catalogCache = { at: Date.now(), items };
    return items;
  }

  private async getPopularity() {
    if (this.popularityCache && Date.now() - this.popularityCache.at < CACHE_TTL_MS) {
      return this.popularityCache;
    }

    const grouped = await this.prisma.orderProduct.groupBy({
      by: ['productId'],
      _count: { productId: true },
    });

    const map: Record<string, number> = {};
    let max = 0;
    for (const row of grouped) {
      const n = row._count.productId;
      map[row.productId] = n;
      if (n > max) max = n;
    }

    this.popularityCache = { at: Date.now(), map, max: max || 1 };
    return this.popularityCache;
  }

  private productInclude() {
    return {
      category: true,
      inventory: { select: { quantity: true } },
      variants: {
        where: { isDefault: true },
        select: { id: true, price: true, images: true, inventory: { select: { quantity: true } } },
      },
    };
  }

  /** Flatten a product into the shape the storefront already consumes. */
  private shape(product: any) {
    const defaultVariant = product.variants?.[0] ?? null;
    const quantity =
      defaultVariant?.inventory?.[0]?.quantity ??
      product.inventory?.[0]?.quantity ??
      0;

    const { variants, ...rest } = product;
    return {
      ...rest,
      price: defaultVariant?.price ?? product.basePrice,
      inventory: { quantity },
      defaultVariant: defaultVariant
        ? { id: defaultVariant.id, price: defaultVariant.price, quantity }
        : null,
    };
  }

  private inStock(shaped: any) {
    return (shaped.inventory?.quantity ?? 0) > 0;
  }

  private isExcluded(name: string) {
    return EXCLUDE_NAME_PATTERNS.some((re) => re.test(name || ''));
  }

  /**
   * Stop one category swamping the feed — but scale the cap to how broad the
   * user's taste actually is. Someone who only likes sneakers should get
   * sneakers, not four sneakers and four unrelated fillers.
   */
  private diversify<T extends { product: any; score: number }>(
    scored: T[],
    limit: number,
    breadth: number,
  ): T[] {
    const cap = Math.max(MIN_PER_CATEGORY, Math.ceil(limit / Math.max(1, breadth)));
    const perCat: Record<string, number> = {};
    const picked: T[] = [];
    const overflow: T[] = [];
    for (const s of scored) {
      const cat = s.product.categoryId || 'none';
      if ((perCat[cat] || 0) < cap) {
        perCat[cat] = (perCat[cat] || 0) + 1;
        picked.push(s);
      } else {
        overflow.push(s);
      }
      if (picked.length >= limit) break;
    }
    // if diversity starved the feed, top it back up from what we held back
    if (picked.length < limit) picked.push(...overflow.slice(0, limit - picked.length));
    return picked;
  }

  /**
   * Builds the user's taste profile from what we actually know:
   * explicit interests, purchase history, and live cart contents.
   */
  private async buildProfile(userId: string) {
    const [customer, orders, cart] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: userId },
        select: { interests: true },
      }),
      this.prisma.order.findMany({
        where: { userId },
        select: { products: { select: { productId: true } } },
      }),
      this.prisma.cart.findUnique({
        where: { userId },
        select: { products: { select: { productId: true } } },
      }),
    ]);

    const orderedIds = orders.flatMap((o) => o.products.map((p) => p.productId));
    const cartIds = cart?.products.map((p) => p.productId) ?? [];

    // resolve those product ids to categories in one query
    const touched = [...new Set([...orderedIds, ...cartIds])];
    const prods = touched.length
      ? await this.prisma.product.findMany({
        where: { id: { in: touched } },
        select: { id: true, categoryId: true },
      })
      : [];
    const catOf = Object.fromEntries(prods.map((p) => [p.id, p.categoryId]));

    const categoryCounts: Record<string, number> = {};
    for (const id of orderedIds) {
      const c = catOf[id];
      if (c) categoryCounts[c] = (categoryCounts[c] || 0) + 1;
    }
    const totalOrdered = orderedIds.length || 1;

    const cartCategories = new Set(
      cartIds.map((id) => catOf[id]).filter(Boolean) as string[],
    );

    return {
      interests: new Set(customer?.interests ?? []),
      categoryAffinity: Object.fromEntries(
        Object.entries(categoryCounts).map(([c, n]) => [c, n / totalOrdered]),
      ) as Record<string, number>,
      cartCategories,
      excludeIds: new Set([...orderedIds, ...cartIds]),
      hasSignal:
        (customer?.interests?.length ?? 0) > 0 ||
        orderedIds.length > 0 ||
        cartIds.length > 0,
    };
  }

  /**
   * Personalised feed. Falls back to trending when we know nothing
   * about the user, which is the correct behaviour rather than an error.
   */
  async getForYou(userId: string, limit = 20) {
    const profile = await this.buildProfile(userId);

    if (!profile.hasSignal) {
      const trending = await this.getTrending(undefined, limit);
      return { success: true, personalised: false, reason: 'no-signal', ...trending };
    }

    const [catalog, popularity] = await Promise.all([this.getCatalog(), this.getPopularity()]);

    const now = Date.now();
    const scored: ScoredProduct[] = [];

    for (const entry of catalog) {
      const p = entry.shaped;
      if (profile.excludeIds.has(p.id)) continue;
      if (this.isExcluded(p.name)) continue;

      const cat = p.categoryId;
      let score = 0;
      const reasons: string[] = [];

      if (cat && profile.interests.has(cat)) {
        score += WEIGHTS.interest;
        reasons.push('interest');
      }
      if (cat && profile.categoryAffinity[cat]) {
        score += WEIGHTS.category * profile.categoryAffinity[cat];
        reasons.push('bought-similar');
      }
      if (cat && profile.cartCategories.has(cat)) {
        score += WEIGHTS.cart;
        reasons.push('in-cart-category');
      }

      const pop = (popularity.map[p.id] ?? 0) / popularity.max;
      if (pop > 0) {
        score += WEIGHTS.popularity * pop;
        reasons.push('popular');
      }

      const ageDays = (now - new Date(entry.createdAt).getTime()) / 864e5;
      if (ageDays < FRESH_WINDOW_DAYS) {
        score += WEIGHTS.freshness * (1 - ageDays / FRESH_WINDOW_DAYS);
        reasons.push('new');
      }

      if (score > 0) scored.push({ product: p, score, reasons });
    }

    // ties are common when several products share a category signal — break them
    // by real demand rather than whatever order Mongo returned
    scored.sort((a, b) =>
      b.score - a.score ||
      (popularity.map[b.product.id] ?? 0) - (popularity.map[a.product.id] ?? 0),
    );
    const breadth = new Set([
      ...profile.interests,
      ...Object.keys(profile.categoryAffinity),
      ...profile.cartCategories,
    ]).size;
    const top = this.diversify(scored, limit, breadth);

    return {
      success: true,
      personalised: true,
      count: top.length,
      products: top.map((s) => ({
        ...s.product,
        _score: Number(s.score.toFixed(3)),
        _reasons: s.reasons,
      })),
    };
  }

  /**
   * Similar products for a PDP. Needs no user, so it works logged-out.
   * Same category, comparable price, ranked by popularity.
   */
  async getSimilar(productId: string, limit = 10) {
    const source = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true, subCategoryId: true, basePrice: true, brandId: true },
    });
    if (!source) throw new NotFoundException('Product not found');

    const [catalog, popularity] = await Promise.all([this.getCatalog(), this.getPopularity()]);
    const candidates = catalog.filter(
      (e) => e.shaped.id !== productId &&
             (!source.categoryId || e.shaped.categoryId === source.categoryId),
    );

    const lo = source.basePrice * (1 - SIMILAR_PRICE_BAND);
    const hi = source.basePrice * (1 + SIMILAR_PRICE_BAND);

    const scored = candidates
      .map((entry) => {
        const p = entry.shaped;
        if (this.isExcluded(p.name)) return null;

        let score = 0;
        if (entry.subCategoryId && entry.subCategoryId === source.subCategoryId) score += 2;
        if (entry.brandId === source.brandId) score += 1;
        if (p.price >= lo && p.price <= hi) score += 1.5;
        score += (popularity.map[p.id] ?? 0) / popularity.max;

        return { product: p, score };
      })
      .filter(Boolean) as { product: any; score: number }[];

    scored.sort((a, b) => b.score - a.score);

    return {
      success: true,
      count: Math.min(scored.length, limit),
      products: scored.slice(0, limit).map((s) => s.product),
    };
  }

  /** Non-personalised popularity, optionally scoped to a category. */
  async getTrending(categoryId?: string, limit = 20) {
    const [catalog, popularity] = await Promise.all([this.getCatalog(), this.getPopularity()]);

    const now = Date.now();
    const scored = catalog
      .filter((e) => !categoryId || e.shaped.categoryId === categoryId)
      .map((entry) => {
        const p = entry.shaped;
        if (this.isExcluded(p.name)) return null;

        const pop = (popularity.map[p.id] ?? 0) / popularity.max;
        const ageDays = (now - new Date(entry.createdAt).getTime()) / 864e5;
        const fresh = ageDays < FRESH_WINDOW_DAYS ? 1 - ageDays / FRESH_WINDOW_DAYS : 0;

        return { product: p, score: pop + WEIGHTS.freshness * fresh };
      })
      .filter(Boolean) as { product: any; score: number }[];

    scored.sort((a, b) => b.score - a.score);

    return {
      success: true,
      count: Math.min(scored.length, limit),
      products: scored.slice(0, limit).map((s) => s.product),
    };
  }
}
