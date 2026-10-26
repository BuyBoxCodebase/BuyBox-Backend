import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { CatalogVocabulary } from '../../search/catalog/catalog-vocabulary.service';
import { SearchService } from '../../search/search.service';
import { GENDERS, SORT_OPTIONS, SearchFilters, SearchProduct, SearchResponse, SortOption } from '../../search/search.types';

const PAGE_SIZE = 8;

const SearchProductsSchema = z.object({
  query: z.string().optional().describe(
    'What the customer wants in their own words, minus anything that has its own field. ' +
      'E.g. "comfortable for standing all day", "air force 1", "clean for a wedding", "waterproof trail". ' +
      'Omit when the customer only gave filters.',
  ),
  brand: z.string().optional().describe('Brand the customer named, e.g. "Nike". Never infer one.'),
  category: z.string().optional().describe('Type or sport the customer named, e.g. "Running", "Basketball", "Sneakers".'),
  colour: z.string().optional().describe('One colour word, e.g. "black".'),
  size: z.string().optional().describe('Size the customer stated, e.g. "9", "9.5", "XL".'),
  minPrice: z.number().optional().describe('Set for "over", "above", "more than" a price.'),
  maxPrice: z.number().optional().describe('Set for "under", "below", "up to", "less than" a price.'),
  gender: z.enum(GENDERS).optional().describe('Only when the customer stated it. Never infer it.'),
  sort: z.enum(SORT_OPTIONS).optional().describe(
    '"price_low_to_high" for cheapest/budget, "price_high_to_low" for premium, "newest" for latest. Omit for best match.',
  ),
  showMore: z.boolean().optional().describe(
    'true only when the customer wants more or different options for the same search ("show me more", "any others?"). ' +
      'Products already shown are left out.',
  ),
});

type SearchProductsArgs = z.infer<typeof SearchProductsSchema>;

// What Lino remembers about its last search in a conversation (stored as LinoConversation.lastIntent).
export interface LinoSearchState {
  query: string;
  filters: SearchFilters;
  sort: SortOption;
  shownIds: string[];
}

export interface ToolContext {
  lastSearch: LinoSearchState | null;
  onSearch: (state: LinoSearchState) => void;
}

// What the model and the chat's product cards receive for each product.
export type LinoProduct = Pick<
  SearchProduct,
  'id' | 'name' | 'brand' | 'category' | 'image' | 'price' | 'priceRange' | 'availableSizes' | 'availableColours' | 'summary'
>;

@Injectable()
export class ToolsService implements OnModuleInit {
  private readonly logger = new Logger(ToolsService.name);
  private ai: any;

  constructor(
    private readonly searchService: SearchService,
    private readonly vocabulary: CatalogVocabulary,
  ) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  getTools(context: ToolContext) {
    if (!this.ai) throw new Error('AI module not initialized');
    const { tool } = this.ai;

    return {
      search_products: tool({
        description: `Search the in-stock catalog, 8 products at a time.
Put what the customer wants in "query" and use the other fields only for things the customer actually said.
If nothing matches every filter, the search relaxes filters by itself and reports them in "loosened".`,
        inputSchema: SearchProductsSchema,
        execute: async (args: SearchProductsArgs) => {
          this.logger.log(`🛠️ search_products called with: ${JSON.stringify(args)}`);
          return this.search(args, context);
        },
      } as any),
    };
  }

  private async search(args: SearchProductsArgs, context: ToolContext) {
    const { filters, unknownText } = await this.vocabulary.resolveFilters(args);
    const text = [args.query, ...unknownText].filter(Boolean).join(' ').trim();
    const sort = args.sort ?? 'relevance';
    const excludeIds = args.showMore ? context.lastSearch?.shownIds ?? [] : [];

    const response = await this.searchService.search({ text, filters, sort, page: 1, pageSize: PAGE_SIZE, excludeIds });

    context.onSearch({ query: text, filters, sort, shownIds: [...excludeIds, ...response.products.map((p) => p.id)] });
    return toToolResult(response);
  }
}

function toToolResult(response: SearchResponse) {
  return {
    total: response.total,
    exactMatch: response.relaxed === null,
    loosened: response.relaxed,
    moreAvailable: response.hasMore,
    products: response.products.map(
      (product): LinoProduct => ({
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        image: product.image,
        price: product.price,
        priceRange: product.priceRange,
        availableSizes: product.availableSizes,
        availableColours: product.availableColours,
        summary: product.summary,
      }),
    ),
  };
}
