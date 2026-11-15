import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

// Keep in sync with MAX_COMMENT_LENGTH in the customer website's useReviews.ts
export const MAX_COMMENT_LENGTH = 500;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// "Jane Doe" -> "Jane D." so a public review doesn't expose a full name
const displayName = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  // The delivered order that lets this customer rate the product, if any.
  // Delivery and pickup orders both end at COMPLETED, so that is the "delivered" state.
  private findQualifyingOrder(userId: string, productId: string) {
    return this.prisma.order.findFirst({
      where: {
        userId,
        status: OrderStatus.COMPLETED,
        products: { some: { productId } },
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
  }

  async getProductReviews(productId: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
    const take = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
    const currentPage = Math.max(page, 1);
    const skip = (currentPage - 1) * take;

    const [grouped, reviews] = await Promise.all([
      this.prisma.productReview.groupBy({
        by: ['rating'],
        where: { productId },
        _count: { _all: true },
      }),
      this.prisma.productReview.findMany({
        where: { productId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          rating: true,
          comment: true,
          imageUrl: true,
          createdAt: true,
          user: { select: { name: true, profilePic: true } },
        },
      }),
    ]);

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let count = 0;
    let sum = 0;
    for (const row of grouped) {
      distribution[row.rating] = row._count._all;
      count += row._count._all;
      sum += row.rating * row._count._all;
    }

    return {
      summary: {
        average: count ? Math.round((sum / count) * 10) / 10 : 0,
        count,
        distribution,
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        imageUrl: r.imageUrl,
        createdAt: r.createdAt,
        author: displayName(r.user?.name),
        authorPic: r.user?.profilePic ?? null,
      })),
      page: currentPage,
      pageSize: take,
      hasMore: skip + reviews.length < count,
    };
  }

  // Tells the product page whether to show the rating form
  async getEligibility(userId: string, productId: string) {
    const [order, existing] = await Promise.all([
      this.findQualifyingOrder(userId, productId),
      this.prisma.productReview.findUnique({
        where: { userId_productId: { userId, productId } },
        select: { id: true, rating: true, comment: true, imageUrl: true },
      }),
    ]);
    return {
      // An existing review stays editable
      canReview: !!order || !!existing,
      myReview: existing,
    };
  }

  async upsertReview(
    userId: string,
    productId: string,
    rating: number,
    comment?: string,
    image?: Express.Multer.File,
    removeImage = false,
  ) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be a whole number from 1 to 5');
    }
    if (comment != null && typeof comment !== 'string') {
      throw new BadRequestException('Comment must be text');
    }
    const trimmed = comment?.trim() || null;
    if (trimmed && trimmed.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException(`Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`);
    }

    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const order = await this.findQualifyingOrder(userId, productId);
    if (!order) {
      throw new ForbiddenException('You can only rate products from an order that has been delivered to you');
    }

    // Uploaded only after every check has passed so a rejected review leaves nothing behind.
    // No new file: keep the current image, unless the customer asked to remove it.
    let imageUrl: string | null | undefined;
    if (image) {
      const [uploaded] = await this.cloudinaryService.uploadImages([image]);
      imageUrl = (uploaded as { secure_url?: string }).secure_url ?? null;
      if (!imageUrl) throw new BadRequestException('Image upload failed, please try again');
    } else if (removeImage) {
      imageUrl = null;
    }

    return this.prisma.productReview.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, orderId: order.id, rating, comment: trimmed, imageUrl: imageUrl ?? null },
      update: { rating, comment: trimmed, ...(imageUrl !== undefined && { imageUrl }) },
      select: { id: true, rating: true, comment: true, imageUrl: true, createdAt: true, updatedAt: true },
    });
  }
}
