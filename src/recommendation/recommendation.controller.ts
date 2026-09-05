import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';

@Controller('recommendation')
export class RecommendationController {
  constructor(private readonly recommendationService: RecommendationService) { }

  @UseGuards(JwtAuthGuard)
  @Get('for-you')
  async getForYou(@Req() req, @Query('limit') limit?: string) {
    return this.recommendationService.getForYou(req.user.userId, Number(limit) || 20);
  }

  @Get('similar/:productId')
  async getSimilar(@Param('productId') productId: string, @Query('limit') limit?: string) {
    return this.recommendationService.getSimilar(productId, Number(limit) || 10);
  }

  @Get('trending')
  async getTrending(@Query('categoryId') categoryId?: string, @Query('limit') limit?: string) {
    return this.recommendationService.getTrending(categoryId, Number(limit) || 20);
  }
}
