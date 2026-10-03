import { SearchFilters } from './search.types';

const EMPTY_WORDS = ['', 'none', 'null', 'any', 'n/a'];

const TEXT_FIELDS = ['productName', 'brand', 'category', 'gender', 'colour', 'size', 'occasion'] as const;
const PRICE_FIELDS = ['minPrice', 'maxPrice'] as const;

// Models sometimes send "none", "", or -1 instead of leaving a field out. Remove those.
export function cleanFilters(raw: Record<string, unknown>): SearchFilters {
  const filters: SearchFilters = {};

  for (const field of TEXT_FIELDS) {
    const text = cleanText(raw[field]);
    if (text) filters[field] = text;
  }

  for (const field of PRICE_FIELDS) {
    const price = cleanPrice(raw[field]);
    if (price !== undefined) filters[field] = price;
  }

  const keywords = cleanKeywords(raw.keywords);
  if (keywords.length > 0) filters.keywords = keywords;

  return filters;
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return EMPTY_WORDS.includes(text.toLowerCase()) ? undefined : text;
}

function cleanPrice(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
