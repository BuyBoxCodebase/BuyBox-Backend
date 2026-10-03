// Shared types for the Lino product search.

export const SORT_OPTIONS = [
  'relevance',
  'price_low_to_high',
  'price_high_to_low',
  'newest',
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number];

export const PAGE_SIZE = 8;

// What the customer asked for. Every field is optional.
export interface SearchFilters {
  productName?: string;
  brand?: string;
  category?: string;
  gender?: string;
  colour?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  occasion?: string;
  keywords?: string[]; // features to look for in the description, e.g. "waterproof"
}

export type FilterName = keyof SearchFilters;

export interface SearchRequest {
  filters: SearchFilters;
  sort: SortOption;
  page: number;
}

// A product variant, flattened to what the search needs.
export interface CandidateVariant {
  price: number;
  stock: number;
  size: string | null;
  colour: string | null;
}

// A product loaded from the database, flattened to what the search needs.
export interface CandidateProduct {
  id: string;
  name: string;
  description: string;
  brand: string | null;
  modelName: string | null;
  categoryName: string | null;
  subCategoryName: string | null;
  primaryActivity: string | null;
  image: string | null;
  createdAt: Date;
  variants: CandidateVariant[];
}

// A product that passed the filters, with its cheapest matching variant.
export interface ProductMatch {
  product: CandidateProduct;
  bestVariant: CandidateVariant;
}

// One try at the search. Later tries have fewer or looser filters.
export interface SearchAttempt {
  filters: SearchFilters;
  droppedFilters: FilterName[];
  widenedPrice: boolean;
}

export interface ProductResult {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  price: number;
  priceRange: { min: number; max: number };
  availableSizes: string[];
  availableColours: string[];
  description: string; // first 100 words of the seller's description
  image: string | null;
}

export interface SearchResponse {
  totalMatches: number;
  page: number;
  hasMore: boolean;
  exactMatch: boolean;
  droppedFilters: FilterName[];
  widenedPrice: { minPrice?: number; maxPrice?: number } | null;
  products: ProductResult[];
}
