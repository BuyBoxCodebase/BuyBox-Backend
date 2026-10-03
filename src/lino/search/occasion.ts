import { CandidateProduct } from './search.types';

// Occasion never removes products. It only moves better fits higher up.

// Common occasions and the categories that usually suit them.
const OCCASION_CATEGORIES: Record<string, string[]> = {
  gym: ['training'],
  workout: ['training'],
  training: ['training'],
  running: ['running'],
  run: ['running'],
  jogging: ['running'],
  marathon: ['running'],
  basketball: ['basketball'],
  hoops: ['basketball'],
  casual: ['lifestyle'],
  everyday: ['lifestyle'],
  party: ['lifestyle'],
};

const PRIMARY_ACTIVITY_POINTS = 3;
const CATEGORY_POINTS = 2;
const TEXT_POINTS = 1;

export function occasionScore(product: CandidateProduct, occasion?: string): number {
  if (!occasion) return 0;
  const wanted = occasion.toLowerCase().trim();

  let score = 0;
  if (primaryActivityMatches(product, wanted)) score += PRIMARY_ACTIVITY_POINTS;
  if (categoryMatches(product, wanted)) score += CATEGORY_POINTS;
  if (textMentions(product, wanted)) score += TEXT_POINTS;
  return score;
}

function primaryActivityMatches(product: CandidateProduct, occasion: string): boolean {
  const activity = product.primaryActivity?.toLowerCase();
  return !!activity && (activity.includes(occasion) || occasion.includes(activity));
}

function categoryMatches(product: CandidateProduct, occasion: string): boolean {
  const suitedCategories = OCCASION_CATEGORIES[occasion] ?? [];
  const productCategories = [product.categoryName, product.subCategoryName]
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  return suitedCategories.some((category) => productCategories.includes(category));
}

function textMentions(product: CandidateProduct, occasion: string): boolean {
  return `${product.name} ${product.description}`.toLowerCase().includes(occasion);
}
