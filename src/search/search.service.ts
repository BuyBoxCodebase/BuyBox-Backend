import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { CatalogVocabulary, RawFilters } from './catalog/catalog-vocabulary.service';
import { getSearchModels } from './db/search-connection';
import { Candidate } from './matching/candidate';
import { buildSearchAttempts, SearchAttempt } from './matching/search-attempts';
import { matchProduct, ProductMatch } from './matching/variant-matcher';
import { colourWords, normaliseText } from './query/normalise';
import { parseQuery, toKeywordText } from './query/parse-query';
import { autocompleteProducts, Retriever } from './retrieval/retriever.service';
import {
  FacetValue,
  SearchFacets,
  SearchFilters,
  SearchProduct,
  SearchRequest,
  SearchResponse,
  SortOption,
  SuggestResponse,
} from './search.types';

export const MAX_PAGE_SIZE = 48;
const SUMMARY_WORD_LIMIT = 30;
const SUGGEST_LIMIT = 5;

// What the navbar sends: the search-box text plus any filters the customer picked on the results page.
export interface TextSearchInput {
  q: string;
  filters: RawFilters;
  sort?: SortOption;
  page: number;
  pageSize: number;
}

// The one product search. The navbar (via SearchController) and Lino (via its search tool) both use it.
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly retriever: Retriever,
    private readonly vocabulary: CatalogVocabulary,
  ) {}

  // Navbar: reads filters out of the text, then searches. Filters chosen on the page win over the text.
  async searchText(input: TextSearchInput): Promise<SearchResponse> {
    const vocabulary = await this.vocabulary.get();
    const parsed = parseQuery(input.q, vocabulary);
    const { filters: explicit, unknownText } = await this.vocabulary.resolveFilters(input.filters, vocabulary);
    const text = [parsed.text, ...unknownText].filter(Boolean).join(' ');

    return this.search({
      text,
      filters: { ...parsed.filters, ...explicit },
      sort: input.sort ?? parsed.sort ?? 'relevance',
      page: input.page,
      pageSize: input.pageSize,
    });
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    const started = Date.now();
    const keywordText = toKeywordText(request.text);
    const excluded = new Set(request.excludeIds ?? []);

    for (const attempt of this.attemptsFor(request)) {
      const candidates = (await this.retriever.retrieve({ text: request.text, keywordText, filters: attempt.filters }))
        .filter((candidate) => !excluded.has(candidate.id));
      const matches = await matchInStock(candidates, attempt.filters);
      if (matches.length > 0) return this.buildResponse(request, attempt, matches, started);
    }

    return this.buildResponse(request, { filters: request.filters, droppedFilters: [], widenedPrice: false }, [], started);
  }

  // Loosening never ends in "no text and no filters": that would show arbitrary products
  // (the old "always the same 8" bug). It stops with an honest empty result instead.
  private attemptsFor(request: SearchRequest): SearchAttempt[] {
    const attempts = buildSearchAttempts(request.filters);
    const wantedSomething = Boolean(request.text) || Object.keys(request.filters).length > 0;
    if (!wantedSomething) return attempts;
    return attempts.filter((attempt) => request.text || Object.keys(attempt.filters).length > 0);
  }

  private buildResponse(
    request: SearchRequest,
    attempt: SearchAttempt,
    matches: ProductMatch[],
    started: number,
  ): SearchResponse {
    const sorted = sortMatches(matches, request.sort);
    const start = (request.page - 1) * request.pageSize;
    const relaxed = attempt.droppedFilters.length > 0 || attempt.widenedPrice;

    const response: SearchResponse = {
      text: request.text,
      filters: attempt.filters,
      requestedFilters: request.filters,
      sort: request.sort,
      relaxed: relaxed
        ? {
            droppedFilters: attempt.droppedFilters,
            widenedPrice: attempt.widenedPrice
              ? { minPrice: attempt.filters.minPrice, maxPrice: attempt.filters.maxPrice }
              : null,
          }
        : null,
      products: sorted.slice(start, start + request.pageSize).map(toSearchProduct),
      facets: buildFacets(matches),
      total: sorted.length,
      page: request.page,
      pageSize: request.pageSize,
      hasMore: start + request.pageSize < sorted.length,
      tookMs: Date.now() - started,
    };

    this.logger.log(
      `search text="${request.text}" filters=${JSON.stringify(request.filters)} → ${response.total} results` +
        `${relaxed ? ` (loosened: ${attempt.droppedFilters.join(', ') || 'price'})` : ''} in ${response.tookMs}ms`,
    );
    return response;
  }

  // Search-box suggestions while typing: matching brands, categories and a few products.
  async suggest(prefix: string): Promise<SuggestResponse> {
    const query = normaliseText(prefix);
    if (query.length < 2) return { brands: [], categories: [], products: [] };

    const [vocabulary, candidates] = await Promise.all([
      this.vocabulary.get(),
      autocompleteProducts(query, SUGGEST_LIMIT),
    ]);
    const startsWith = (key: string) => key.startsWith(query) || key.includes(` ${query}`);

    return {
      brands: vocabulary.brands.filter((entry) => startsWith(entry.key)).slice(0, 3).map((entry) => entry.label),
      categories: vocabulary.categories.filter((entry) => startsWith(entry.key)).slice(0, 3).map((entry) => entry.label),
      products: candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        brand: candidate.brand,
        image: candidate.image,
        price: Math.min(...candidate.variants.map((variant) => variant.price)),
      })),
    };
  }
}

// Reads stock for every candidate variant in one query and keeps the products with a matching in-stock variant.
async function matchInStock(candidates: Candidate[], filters: SearchFilters): Promise<ProductMatch[]> {
  if (candidates.length === 0) return [];
  const variantIds = candidates.flatMap((candidate) => candidate.variants.map((variant) => variant.variantId));

  const { Inventory } = await getSearchModels();
  const rows = await Inventory.find(
    { variantId: { $in: variantIds.map((id) => new Types.ObjectId(id)) }, quantity: { $gt: 0 } },
    { variantId: 1, quantity: 1 },
  ).lean();

  const stockByVariant = new Map<string, number>();
  for (const row of rows) {
    const id = String(row.variantId);
    stockByVariant.set(id, (stockByVariant.get(id) ?? 0) + row.quantity);
  }

  return candidates.map((candidate) => matchProduct(candidate, filters, stockByVariant)).filter(Boolean);
}

// Relevance keeps the retrieval order (fused relevance, or newest first for filter-only searches).
function sortMatches(matches: ProductMatch[], sort: SortOption): ProductMatch[] {
  const sorted = [...matches];
  if (sort === 'price_low_to_high') sorted.sort((a, b) => a.best.price - b.best.price);
  if (sort === 'price_high_to_low') sorted.sort((a, b) => b.best.price - a.best.price);
  if (sort === 'newest') sorted.sort((a, b) => b.candidate.createdAt - a.candidate.createdAt);
  return sorted;
}

function toSearchProduct(match: ProductMatch): SearchProduct {
  const { candidate, inStock, best, bestStock } = match;
  const prices = inStock.map((variant) => variant.price);

  return {
    id: candidate.id,
    name: candidate.name,
    brand: candidate.brand,
    category: candidate.subCategory ?? candidate.category,
    categoryId: candidate.categoryId,
    subCategoryId: candidate.subCategoryId,
    image: candidate.image ?? best.images[0] ?? null,
    price: best.price,
    priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
    availableSizes: sortSizes(unique(inStock.map((variant) => variant.size))),
    availableColours: unique(inStock.map((variant) => variant.colour)).sort(),
    variantId: best.variantId,
    variantImages: best.images,
    variantOptions: [best.size, best.colour].filter(Boolean),
    stock: bestStock,
    summary: firstWords(candidate.description, SUMMARY_WORD_LIMIT),
  };
}

// Counts are products, not variants: "Black (12)" means 12 products have black in stock.
function buildFacets(matches: ProductMatch[]): SearchFacets {
  const brands = new Map<string, number>();
  const colours = new Map<string, number>();
  const sizes = new Map<string, number>();

  for (const { candidate, inStock } of matches) {
    if (candidate.brand) count(brands, candidate.brand);
    for (const colour of unique(inStock.flatMap((variant) => colourWords(variant.colour)))) count(colours, colour);
    for (const size of unique(inStock.map((variant) => variant.size))) count(sizes, size);
  }

  const prices = matches.map((match) => match.best.price);
  return {
    brands: toFacetValues(brands).sort((a, b) => b.count - a.count),
    colours: toFacetValues(colours).sort((a, b) => b.count - a.count),
    sizes: sortFacetSizes(toFacetValues(sizes)),
    price: prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
  };
}

function count(counts: Map<string, number>, value: string) {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function toFacetValues(counts: Map<string, number>): FacetValue[] {
  return [...counts.entries()].map(([value, total]) => ({ value, count: total }));
}

function sortFacetSizes(values: FacetValue[]): FacetValue[] {
  const order = sortSizes(values.map((v) => v.value));
  return order.map((size) => values.find((v) => v.value === size));
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

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= limit ? text.trim() : `${words.slice(0, limit).join(' ')}…`;
}
