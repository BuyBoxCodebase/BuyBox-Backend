import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Injectable()
export class CouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService
  ) {}

  async uploadCouponImage(files: Array<Express.Multer.File>) {
    const images = await this.cloudinaryService.uploadImages(files);
    const urls = images.map((image) => ({
      publicId: image.public_id,
      url: image.url,
    }));
    return urls;
  }

  async createCoupon({
    name,
    couponCode,
    offerDetails,
    imageUrl,
  }: {
    name: string;
    couponCode: string;
    offerDetails: any;
    imageUrl: string;
  }) {
    return this.prisma.coupon.create({
      data: {
        name,
        couponCode,
        offerDetails,
        imageUrl,
      },
    });
  }

  async updateCoupon({
    id,
    name,
    couponCode,
    offerDetails,
    imageUrl,
  }: {
    id: string;
    name?: string;
    couponCode?: string;
    offerDetails?: any;
    imageUrl?: string;
  }) {
    await this.getCouponById(id); 

    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(couponCode && { couponCode }),
        ...(offerDetails && { offerDetails }),
        ...(imageUrl && { imageUrl }),
      },
    });
  }

  async deleteCoupon({ id }: { id: string }) {
    await this.getCouponById(id); 
    return this.prisma.coupon.delete({
      where: { id },
    });
  }

  async getCoupons() {
    return this.prisma.coupon.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getCouponById(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  async getCouponByCode(couponCode: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { couponCode } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }
}
