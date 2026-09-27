import { ProductScoreDto } from './product-score.dto';

export class RecommendationResponseDto {
  userId!: string;
  recommendedProducts!: string[];
  scores!: ProductScoreDto[];
}