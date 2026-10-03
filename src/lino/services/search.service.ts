import { Injectable, Logger } from '@nestjs/common';
import { buildSearchAttempts } from '../search/search-attempts';
import { sortMatches } from '../search/product-ranker';
import { toProductResult } from '../search/product-result';
import { SearchRepository } from '../search/search-repository';
import { matchProduct } from '../search/variant-matcher';
import {
  CandidateProduct,
  PAGE_SIZE,
  ProductMatch,
  SearchAttempt,
  SearchFilters,
  SearchRequest,
  SearchResponse,
} from '../search/search.types';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly repository: SearchRepository) {}

  // Tries the exact search first, then looser versions until something is found.
  async search(request: SearchRequest): Promise<SearchResponse> {
    this.logger.log(`Searching for: ${JSON.stringify(request)}`);
    const loadCandidates = this.createCandidateLoader(request);

    for (const attempt of buildSearchAttempts(request.filters)) {
      const candidates = await loadCandidates(attempt.filters);
      const matches = findMatches(candidates, attempt.filters);
      if (matches.length > 0) {
        return this.buildResponse(request, attempt, matches);
      }
    }

    return emptyResponse(request.page);
  }

  // Several attempts often send the same database filters (only size, colour or price changed).
  // Remember those results so the database is asked only once per set of filters.
  private createCandidateLoader(request: SearchRequest) {
    const cache = new Map<string, Promise<CandidateProduct[]>>();

    return (filters: SearchFilters) => {
      const key = databaseFiltersKey(filters);
      if (!cache.has(key)) {
        cache.set(key, this.repository.findCandidates(filters, request.sort));
      }
      return cache.get(key);
    };
  }

  private buildResponse(request: SearchRequest, attempt: SearchAttempt, matches: ProductMatch[]): SearchResponse {
    const sorted = sortMatches(matches, request.sort, attempt.filters);
    const pageMatches = getPage(sorted, request.page);

    return {
      totalMatches: sorted.length,
      page: request.page,
      hasMore: request.page * PAGE_SIZE < sorted.length,
      exactMatch: attempt.droppedFilters.length === 0 && !attempt.widenedPrice,
      droppedFilters: attempt.droppedFilters,
      widenedPrice: attempt.widenedPrice
        ? { minPrice: attempt.filters.minPrice, maxPrice: attempt.filters.maxPrice }
        : null,
      products: pageMatches.map(toProductResult),
    };
  }
}

function findMatches(candidates: CandidateProduct[], filters: SearchFilters): ProductMatch[] {
  return candidates.map((product) => matchProduct(product, filters)).filter(Boolean);
}

function getPage<T>(items: T[], page: number): T[] {
  const start = (page - 1) * PAGE_SIZE;
  return items.slice(start, start + PAGE_SIZE);
}

// Only the filters the database uses (see SearchRepository.buildWhere).
function databaseFiltersKey({ brand, category, gender, productName }: SearchFilters): string {
  return JSON.stringify({ brand, category, gender, productName });
}

function emptyResponse(page: number): SearchResponse {
  return {
    totalMatches: 0,
    page,
    hasMore: false,
    exactMatch: false,
    droppedFilters: [],
    widenedPrice: null,
    products: [],
  };
}
