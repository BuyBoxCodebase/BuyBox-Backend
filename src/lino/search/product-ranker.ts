import { keywordScore } from './description-match';
import { occasionScore } from './occasion';
import { ProductMatch, SearchFilters, SortOption } from './search.types';

type Comparator = (a: ProductMatch, b: ProductMatch) => number;

export function sortMatches(
  matches: ProductMatch[],
  sort: SortOption,
  filters: SearchFilters,
): ProductMatch[] {
  const compare = buildComparator(sort, filters);
  return [...matches].sort((a, b) => compare(a, b) || byNewest(a, b));
}

function buildComparator(sort: SortOption, filters: SearchFilters): Comparator {
  switch (sort) {
    case 'price_low_to_high':
      return (a, b) => a.bestVariant.price - b.bestVariant.price;
    case 'price_high_to_low':
      return (a, b) => b.bestVariant.price - a.bestVariant.price;
    case 'newest':
      return byNewest;
    case 'relevance':
    default:
      return (a, b) => relevanceScore(b, filters) - relevanceScore(a, filters);
  }
}

function byNewest(a: ProductMatch, b: ProductMatch): number {
  return b.product.createdAt.getTime() - a.product.createdAt.getTime();
}

// Name match matters most, then occasion and description keywords. Ties go to the newest product.
function relevanceScore(match: ProductMatch, filters: SearchFilters): number {
  return (
    nameScore(match, filters.productName) +
    occasionScore(match.product, filters.occasion) +
    keywordScore(match.product, filters.keywords)
  );
}

function nameScore(match: ProductMatch, productName?: string): number {
  if (!productName) return 0;
  const wanted = productName.toLowerCase();
  const { name, modelName } = match.product;

  if (name.toLowerCase() === wanted || modelName?.toLowerCase() === wanted) return 4;
  if (name.toLowerCase().includes(wanted) || modelName?.toLowerCase().includes(wanted)) return 2;
  return 0; // matched only in the description
}
