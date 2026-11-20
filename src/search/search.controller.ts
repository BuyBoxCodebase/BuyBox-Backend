import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../../libs/common/src';
import { SearchIndexer } from './index/search-indexer.service';
import { MAX_PAGE_SIZE, SearchService } from './search.service';
import { SORT_OPTIONS, SortOption } from './search.types';

const DEFAULT_PAGE_SIZE = 24;

@Controller('search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly indexer: SearchIndexer,
  ) {}

  // GET /search?q=black nike&size=9&sort=price_low_to_high&page=1&pageSize=24
  // Filters in the URL (brand, category, gender, colour, size, minPrice, maxPrice) override what the text says.
  @Get()
  search(@Query() query: Record<string, string>) {
    return this.searchService.searchText({
      q: (asString(query.q) ?? '').slice(0, 200),
      filters: {
        brand: asString(query.brand),
        category: asString(query.category),
        gender: asString(query.gender),
        colour: asString(query.colour),
        size: asString(query.size),
        minPrice: toNumber(asString(query.minPrice)),
        maxPrice: toNumber(asString(query.maxPrice)),
      },
      sort: (SORT_OPTIONS as readonly string[]).includes(asString(query.sort)) ? (query.sort as SortOption) : undefined,
      page: clamp(toNumber(asString(query.page)) ?? 1, 1, 1000),
      pageSize: clamp(toNumber(asString(query.pageSize)) ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    });
  }

  // GET /search/suggest?q=nik
  @Get('suggest')
  suggest(@Query('q') rawQuery: unknown) {
    const q = asString(rawQuery) ?? '';
    return this.searchService.suggest(q.slice(0, 100));
  }

  // Rebuilds the whole search index. Products whose text hasn't changed are not re-embedded.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('reindex')
  @HttpCode(200)
  reindex() {
    return this.indexer.rebuildAll();
  }
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.floor(value), min), max);
}

// ?q[]=a or ?size[x]=1 arrive as arrays/objects; only a plain string is a usable value.
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
