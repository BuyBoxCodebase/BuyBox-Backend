import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { SearchService } from '../../search/search.service';
import { SearchProduct, SearchResponse } from '../../search/search.types';

const PAGE_SIZE = 8;

const SearchProductsSchema = z.object({
  query: z.string().describe(
    'Everything the customer is looking for, in their own words, including brand, colour, size, price and gender ' +
    'when they said them. E.g. "black nike running shoes size 9 under $80", "air jordan 4", "something clean for a wedding". ' +
    'Never add a word the customer did not say.',
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

  constructor(private readonly searchService: SearchService) { }

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  getTools(context: ToolContext) {
    if (!this.ai) throw new Error('AI module not initialized');
    const { tool } = this.ai;

    return {
      search_products: tool({
        description: `Search the in-stock catalog, 8 products at a time.
Put everything the customer asked for in "query", in their own words. Filters such as brand, colour, size and price are read from the text.
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
    const showMore = args.showMore === true && context.lastSearch !== null;
    const query = args.query?.trim() || (showMore ? context.lastSearch.query : '');
    const excludeIds = showMore ? context.lastSearch.shownIds : [];

    const response = await this.searchService.searchText({
      q: query,
      filters: {},
      page: 1,
      pageSize: PAGE_SIZE,
      excludeIds,
    });

    context.onSearch({ query, shownIds: [...excludeIds, ...response.products.map((p) => p.id)] });
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
