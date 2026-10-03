import { isInStock } from './variant-matcher';
import { CandidateVariant, ProductMatch, ProductResult } from './search.types';

// Keeps what the model reads per product small.
const DESCRIPTION_WORD_LIMIT = 100;

// Turns a match into what the model and the product cards receive.
export function toProductResult(match: ProductMatch): ProductResult {
  const { product, bestVariant } = match;
  const inStockVariants = product.variants.filter(isInStock);

  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.subCategoryName ?? product.categoryName,
    price: bestVariant.price,
    priceRange: priceRange(inStockVariants),
    availableSizes: sortSizes(uniqueValues(inStockVariants.map((v) => v.size))),
    availableColours: uniqueValues(inStockVariants.map((v) => v.colour)).sort(),
    description: firstWords(product.description, DESCRIPTION_WORD_LIMIT),
    image: product.image,
  };
}

function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= limit ? text.trim() : `${words.slice(0, limit).join(' ')}…`;
}

function priceRange(variants: CandidateVariant[]): { min: number; max: number } {
  const prices = variants.map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function uniqueValues(values: (string | null)[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// Number sizes in number order ("8", "9", "10"), then everything else.
function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const numberA = Number(a);
    const numberB = Number(b);
    const bothNumbers = !Number.isNaN(numberA) && !Number.isNaN(numberB);
    return bothNumbers ? numberA - numberB : a.localeCompare(b, undefined, { numeric: true });
  });
}
