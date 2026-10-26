// Shared types for the product search used by the navbar and by Lino.

export const SORT_OPTIONS = ['relevance', 'price_low_to_high', 'price_high_to_low', 'newest'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const GENDERS = ['male', 'female', 'unisex'] as const;
export type Gender = (typeof GENDERS)[number];

// Hard filters. A product must match all of them (on one in-stock variant for size, colour and price).
export interface SearchFilters {
  brand?: string; // as shown to customers, e.g. "New Balance"
  category?: string; // category or sub-category name, e.g. "Running"
  gender?: Gender;
  colour?: string; // lowercase colour word, e.g. "black"
  size?: string; // normalised, e.g. "9.5"
  minPrice?: number;
  maxPrice?: number;
}

export type FilterName = keyof SearchFilters;

export interface SearchRequest {
  text: string; // what the customer wants in their own words, without the filter words. May be empty.
  filters: SearchFilters;
  sort: SortOption;
  page: number;
  pageSize: number;
  excludeIds?: string[]; // products the customer has already seen (Lino's "show me something else")
}

// What the parser understood from the search box.
export interface ParsedQuery {
  text: string; // used for meaning (vector) search
  keywordText: string; // `text` without filler words, used for keyword search
  filters: SearchFilters;
  sort?: SortOption;
}

export interface SearchProduct {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  image: string | null;
  price: number; // price of the best matching in-stock variant
  priceRange: { min: number; max: number };
  availableSizes: string[];
  availableColours: string[];
  variantId: string; // the best matching in-stock variant, used by "add to cart"
  variantImages: string[];
  variantOptions: string[]; // e.g. ["9", "Black"]
  stock: number; // stock of that variant
  summary: string; // start of the description
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface SearchFacets {
  brands: FacetValue[];
  colours: FacetValue[];
  sizes: FacetValue[];
  price: { min: number; max: number } | null;
}

// Filters that had to be loosened because nothing matched them exactly.
export interface Relaxation {
  droppedFilters: FilterName[];
  widenedPrice: { minPrice?: number; maxPrice?: number } | null;
}

export interface SearchResponse {
  text: string;
  filters: SearchFilters; // the filters actually used (after loosening)
  requestedFilters: SearchFilters;
  sort: SortOption;
  relaxed: Relaxation | null;
  products: SearchProduct[];
  facets: SearchFacets;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  tookMs: number;
}

export interface SuggestResponse {
  brands: string[];
  categories: string[];
  products: { id: string; name: string; brand: string | null; image: string | null; price: number }[];
}
