import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductScoreDto } from './dto';

export interface ScoringWeights {
  subCategoryAffinity: number;
  priceBand: number;
  brandLoyalty: number;
  popularity: number;
  recency: number;
}

@Injectable()
export class RecommendationsService {
  private weights: ScoringWeights = {
    subCategoryAffinity: 0.3,
    priceBand: 0.2,
    brandLoyalty: 0.2,
    popularity: 0.15,
    recency: 0.1,
  };

  constructor(private readonly db: PrismaService) {}

  async scoreProduct(productId: string, userId: string): Promise<number> {
    this.validateObjectId(productId, 'productId');
    this.validateObjectId(userId, 'userId');

    const product = await this.db.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        subCategoryId: true,
        brandId: true,
        basePrice: true,
        createdAt: true,
        inventory: { select: { quantity: true } },
        variants: {
          select: { inventory: { select: { quantity: true } } },
        },
      },
    });

    if (!product) return 0;

    let score = 0;
    const subCategoryEvents = product.subCategoryId
      ? await this.db.userEvent.count({
          where: { customerId: userId, subCategoryId: product.subCategoryId },
        })
      : 0;
    const userHistoryCount = await this.db.userEvent.count({
      where: { customerId: userId },
    });

    const subCategoryScore = Math.min(
      subCategoryEvents / Math.max(userHistoryCount, 1),
      1,
    );
    score += subCategoryScore * this.weights.subCategoryAffinity;

    const orderItems = await this.db.orderProduct.findMany({
      where: { order: { is: { userId } } },
      select: { totalPrice: true, quantity: true },
    });
    const totalQuantity = orderItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const averageUnitPrice =
      totalQuantity > 0
        ? orderItems.reduce((total, item) => total + item.totalPrice, 0) /
          totalQuantity
        : 0;

    if (averageUnitPrice > 0) {
      const priceDiff = Math.abs(product.basePrice - averageUnitPrice) / averageUnitPrice;
      score += Math.max(1 - priceDiff, 0) * this.weights.priceBand;
    }

    const brandPurchases = await this.db.orderProduct.count({
      where: {
        order: { is: { userId } },
        product: { is: { brandId: product.brandId } },
      },
    });
    const brandScore = Math.min(
      brandPurchases / Math.max(orderItems.length, 1),
      1,
    );
    score += brandScore * this.weights.brandLoyalty;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const productEngagement = await this.db.userEvent.count({
      where: {
        productId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });
    const recentPurchases = await this.db.orderProduct.count({
      where: {
        productId,
        order: { is: { createdAt: { gte: thirtyDaysAgo } } },
      },
    });
    const engagementScore = Math.min(
      Math.log1p(productEngagement + recentPurchases * 3) / 10,
      1,
    );
    score += engagementScore * this.weights.popularity;

    const daysSinceAdded = Math.floor(
      (Date.now() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceAdded < 30) {
      score += (1 - daysSinceAdded / 30) * this.weights.recency;
    }

    const stock =
      product.inventory.reduce((total, item) => total + item.quantity, 0) +
      product.variants.reduce(
        (total, variant) =>
          total +
          variant.inventory.reduce((variantTotal, item) => variantTotal + item.quantity, 0),
        0,
      );
    if (stock === 0) {
      score = 0;
    } else if (stock < 3) {
      score *= 0.5;
    }

    return score;
  }

  async rankCandidatesWithScores(
    candidateIds: string[],
    userId: string,
    topN = 10,
  ): Promise<ProductScoreDto[]> {
    this.validateObjectId(userId, 'userId');
    if (!Array.isArray(candidateIds) || candidateIds.length > 200) {
      throw new BadRequestException('candidateIds must contain at most 200 product IDs');
    }
    candidateIds.forEach((productId) =>
      this.validateObjectId(productId, 'candidateIds entry'),
    );

    const uniqueIds = [...new Set(candidateIds)];
    const scored = await Promise.all(
      uniqueIds.map(async (productId) => ({
        productId,
        score: await this.scoreProduct(productId, userId),
      })),
    );
    scored.sort(
      (left, right) =>
        right.score - left.score || left.productId.localeCompare(right.productId),
    );

    const products = await this.db.product.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, brandId: true },
    });
    const brandByProductId = new Map(
      products.map((product) => [product.id, product.brandId]),
    );
    const brandCount: Record<string, number> = {};
    const final: ProductScoreDto[] = [];
    const limit = Number.isInteger(topN) && topN > 0 ? Math.min(topN, 50) : 10;

    for (const productScore of scored) {
      const brand = brandByProductId.get(productScore.productId);
      if (!brand) continue;
      if ((brandCount[brand] || 0) >= 2) continue;

      final.push(productScore);
      brandCount[brand] = (brandCount[brand] || 0) + 1;
      if (final.length >= limit) break;
    }

    return final;
  }

  async rankCandidates(
    candidateIds: string[],
    userId: string,
    topN = 10,
  ): Promise<string[]> {
    const ranked = await this.rankCandidatesWithScores(candidateIds, userId, topN);
    return ranked.map(({ productId }) => productId);
  }

  setWeights(weights: Partial<ScoringWeights>) {
    if (
      Object.values(weights).some(
        (weight) => weight !== undefined && (!Number.isFinite(weight) || weight < 0),
      )
    ) {
      throw new BadRequestException('Scoring weights must be finite non-negative numbers');
    }

    this.weights = { ...this.weights, ...weights };
  }

  private validateObjectId(value: string, field: string): void {
    if (!/^[a-f\d]{24}$/i.test(value)) {
      throw new BadRequestException(`${field} must be a valid MongoDB ObjectId`);
    }
  }
}