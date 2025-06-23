import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { CouponService } from './coupon.service';
import { Roles, RolesGuard } from '../../libs/common/src';
import { SessionAuthGuard } from '../../libs/shared/src';
import { FilesInterceptor } from '@nestjs/platform-express';

@Controller('coupon')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('/upload/image')
  @UseInterceptors(
    FilesInterceptor('files', 1, {
      fileFilter(req, file, callback) {
        if (!file.mimetype.match(/\/(jpg|jpeg|png)$/)) {
          return callback(new BadRequestException('Only JPG, JPEG, and PNG files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  )
  uploadCouponImage(@UploadedFiles() files: Array<Express.Multer.File>) {
    return this.couponService.uploadCouponImage(files);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('/create')
  createCoupon(
    @Body()
    body: {
      name: string;
      couponCode: string;
      offerDetails: any;
      imageUrl: string;
    },
  ) {
    return this.couponService.createCoupon(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch('/update')
  updateCoupon(
    @Body()
    body: {
      id: string;
      name?: string;
      couponCode?: string;
      offerDetails?: any;
      imageUrl?: string;
    },
  ) {
    return this.couponService.updateCoupon(body);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete('/delete')
  deleteCoupon(@Body() body: { id: string }) {
    return this.couponService.deleteCoupon(body);
  }

  @Get('/get')
  getCoupons() {
    return this.couponService.getCoupons();
  }

  @Get('/get/:id')
  getCouponById(@Param('id') id: string) {
    return this.couponService.getCouponById(id);
  }

  @Get('/get-by-code/:couponCode')
  getCouponByCode(@Param('couponCode') couponCode: string) {
    return this.couponService.getCouponByCode(couponCode);
  }
}
