import { Module } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [
    
      PrismaModule,
      CloudinaryModule,
    ],
  controllers: [CouponController],
  providers: [CouponService],
})
export class CouponModule {}
