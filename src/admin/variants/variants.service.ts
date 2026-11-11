import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, VariantApprovalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchIndexer } from '../../search/index/search-indexer.service';
import { CacheTag, FrontendApp, revalidateFrontendCache } from '../../../libs/common/src';

const MAX_REASON_LENGTH = 500;

@Injectable()
export class AdminVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly searchIndexer: SearchIndexer,
  ) { }

  async list(status: VariantApprovalStatus, page: number, limit: number) {
    const take = Math.min(Math.max(limit || 10, 1), 100);
    const currentPage = Math.max(page || 1, 1);
    const skip = (currentPage - 1) * take;
    const where: Prisma.ProductVariantWhereInput = { approvalStatus: status };

    const [variants, total, counts] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        // Oldest first for the pending queue so nothing waits forever
        orderBy: { createdAt: status === VariantApprovalStatus.PENDING ? 'asc' : 'desc' },
        skip,
        take,
        include: {
          inventory: { select: { quantity: true } },
          options: { include: { optionValue: { include: { option: { select: { name: true } } } } } },
          product: {
            select: {
              id: true,
              name: true,
              description: true,
              brand: true,
              modelName: true,
              images: true,
              basePrice: true,
              category: { select: { name: true } },
              subCategory: { select: { name: true } },
              seller: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      this.prisma.productVariant.count({ where }),
      this.statusCounts(),
    ]);

    return {
      success: true,
      counts,
      page: currentPage,
      limit: take,
      total,
      totalPages: Math.ceil(total / take),
      variants: variants.map(({ options, inventory, ...variant }) => ({
        ...variant,
        quantity: inventory.reduce((sum, row) => sum + row.quantity, 0),
        options: options.map((o) => ({ name: o.optionValue.option.name, value: o.optionValue.value })),
      })),
    };
  }

  approve(adminId: string, variantIds: string[]) {
    return this.review(adminId, variantIds, VariantApprovalStatus.APPROVED, null);
  }

  reject(adminId: string, variantIds: string[], reason: string) {
    const trimmed = (reason ?? '').trim();
    if (!trimmed) throw new BadRequestException('A rejection reason is required');
    if (trimmed.length > MAX_REASON_LENGTH) {
      throw new BadRequestException(`Reason must be at most ${MAX_REASON_LENGTH} characters`);
    }
    return this.review(adminId, variantIds, VariantApprovalStatus.REJECTED, trimmed);
  }

  private async statusCounts() {
    const [pending, approved, rejected] = await Promise.all(
      [VariantApprovalStatus.PENDING, VariantApprovalStatus.APPROVED, VariantApprovalStatus.REJECTED].map(
        (approvalStatus) => this.prisma.productVariant.count({ where: { approvalStatus } }),
      ),
    );
    return { pending, approved, rejected };
  }

  private async review(
    adminId: string,
    variantIds: string[],
    status: VariantApprovalStatus,
    rejectionReason: string | null,
  ) {
    const ids = [...new Set(variantIds ?? [])];
    if (ids.length === 0) throw new BadRequestException('variantIds is required');
    if (ids.length > 100) throw new BadRequestException('At most 100 variants can be reviewed at once');

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, productId: true },
    });
    if (variants.length !== ids.length) {
      throw new NotFoundException('One or more variants were not found');
    }

    await this.prisma.productVariant.updateMany({
      where: { id: { in: ids } },
      data: { approvalStatus: status, rejectionReason, reviewedAt: new Date(), reviewedById: adminId },
    });

    // Listings and search only serve approved variants, so refresh the search index and the website cache
    for (const productId of new Set(variants.map((v) => v.productId))) {
      await this.searchIndexer.reindexProduct(productId);
    }
    await revalidateFrontendCache(FrontendApp.CUSTOMER_WEB, CacheTag.SUBCATEGORY_PRODUCTS);

    return { success: true, updated: ids.length, status };
  }
}
