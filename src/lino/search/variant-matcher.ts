import { CandidateProduct, CandidateVariant, ProductMatch, SearchFilters } from './search.types';

// Finds the in-stock variants that match size, colour and price.
// Returns null when no variant matches, so the product is left out.
export function matchProduct(product: CandidateProduct, filters: SearchFilters): ProductMatch | null {
  const matchingVariants = product.variants.filter(
    (variant) => isInStock(variant) && variantMatches(variant, filters),
  );
  if (matchingVariants.length === 0) return null;

  return { product, bestVariant: cheapestVariant(matchingVariants) };
}

export function isInStock(variant: CandidateVariant): boolean {
  return variant.stock > 0;
}

function variantMatches(variant: CandidateVariant, filters: SearchFilters): boolean {
  return (
    sizeMatches(variant.size, filters.size) &&
    colourMatches(variant.colour, filters.colour) &&
    priceMatches(variant.price, filters.minPrice, filters.maxPrice)
  );
}

// "9", "US 9" and "9.0" are all treated as the same size.
function sizeMatches(variantSize: string | null, wantedSize?: string): boolean {
  if (!wantedSize) return true;
  if (!variantSize) return false;
  return normaliseSize(variantSize) === normaliseSize(wantedSize);
}

function normaliseSize(size: string): string {
  const text = size.toLowerCase().replace(/\b(us|uk|eu|size)\b/g, '').replace(/\s+/g, '');
  const number = Number(text);
  return Number.isNaN(number) ? text : String(number);
}

// "white" matches "White" and "Triple White".
function colourMatches(variantColour: string | null, wantedColour?: string): boolean {
  if (!wantedColour) return true;
  if (!variantColour) return false;
  return variantColour.toLowerCase().includes(wantedColour.toLowerCase());
}

function priceMatches(price: number, minPrice?: number, maxPrice?: number): boolean {
  if (minPrice !== undefined && price < minPrice) return false;
  if (maxPrice !== undefined && price > maxPrice) return false;
  return true;
}

function cheapestVariant(variants: CandidateVariant[]): CandidateVariant {
  return variants.reduce((cheapest, variant) => (variant.price < cheapest.price ? variant : cheapest));
}
