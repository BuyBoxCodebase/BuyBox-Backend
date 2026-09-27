import { Body, Controller, Post } from '@nestjs/common';
import { GetRecommendationsDto, RecommendationResponseDto } from './dto';
import { RecommendationsService } from './recommendations.service';

@Controller('api/recommendations')
export class RecommendationsController {
  constructor(
    private readonly recommendationsService: RecommendationsService,
  ) {}

  @Post('generate')
  async generate(
    @Body() dto: GetRecommendationsDto,
  ): Promise<RecommendationResponseDto> {
    const scores = await this.recommendationsService.rankCandidatesWithScores(
      dto.candidateIds,
      dto.userId,
      10,
    );

    return {
      userId: dto.userId,
      recommendedProducts: scores.map(({ productId }) => productId),
      scores,
    };
  }
}