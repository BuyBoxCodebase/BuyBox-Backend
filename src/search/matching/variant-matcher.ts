import { SearchDocVariant } from '../db/search-models';
import { colourWords, normaliseSize } from '../query/normalise';
import { SearchFilters } from '../search.types';
import { Candidate } from './candidate';

// A product that has at least one in-stock variant matching the size, colour and price filters.
export interface ProductMatch {
  candidate: Candidate;
  inStock: SearchDocVariant[]; // every in-stock variant, for the sizes/colours shown on the card
  best: SearchDocVariant; // the cheapest matching in-stock variant
  bestStock: number;
}

// Stock is read live for every search, so an item that sold out a minute ago is never shown.
export function matchProduct(
  candidate: Candidate,
  filters: SearchFilters,
  stockByVariant: Map<string, number>,
): ProductMatch | null {
  const inStock = candidate.variants.filter((variant) => (stockByVariant.get(variant.variantId) ?? 0) > 0);
  const matching = inStock.filter((variant) => variantMatches(variant, filters));
  if (matching.length === 0) return null;

  const best = matching.reduce((cheapest, variant) => (variant.price < cheapest.price ? variant : cheapest));
  return { candidate, inStock, best, bestStock: stockByVariant.get(best.variantId) ?? 0 };
}

function variantMatches(variant: SearchDocVariant, filters: SearchFilters): boolean {
  if (filters.size && (!variant.size || normaliseSize(variant.size) !== filters.size)) return false;
  if (filters.colour && !colourWords(variant.colour).includes(filters.colour)) return false;
  if (filters.minPrice !== undefined && variant.price < filters.minPrice) return false;
  if (filters.maxPrice !== undefined && variant.price > filters.maxPrice) return false;
  return true;
}
