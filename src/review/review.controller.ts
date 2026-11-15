import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { GetUser } from '../../libs/common/src/get-user.decorator';
import { Roles, RolesGuard } from '../../libs/common/src';
import { ReviewService } from './review.service';
import { UpsertReviewDto } from './dto/upsert-review.dto';

// Keep in sync with MAX_REVIEW_IMAGE_MB in the customer website's useReviews.ts
const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller('review')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // Public: anonymous visitors can read ratings, they just can't leave one
  @Get('/product/:productId')
  getProductReviews(
    @Param('productId') productId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reviewService.getProductReviews(productId, Number(page) || 1, Number(pageSize) || undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Get('/product/:productId/eligibility')
  getEligibility(@GetUser('userId') userId: string, @Param('productId') productId: string) {
    return this.reviewService.getEligibility(userId, productId);
  }

  // Create or update the customer's rating. Needs a delivered order containing the product.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('CUSTOMER')
  @Put('/product/:productId')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_REVIEW_IMAGE_BYTES, files: 1 },
      fileFilter(req, file, callback) {
        if (!file.mimetype.startsWith('image/')) {
          return callback(new BadRequestException('Only image files are allowed!'), false);
        }
        callback(null, true);
      },
    }),
  )
  upsertReview(
    @GetUser('userId') userId: string,
    @Param('productId') productId: string,
    @Body() body: UpsertReviewDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.reviewService.upsertReview(
      userId,
      productId,
      Number(body.rating),
      body.comment,
      image,
      body.removeImage === 'true',
    );
  }
}
