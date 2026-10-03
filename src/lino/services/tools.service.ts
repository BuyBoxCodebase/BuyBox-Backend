import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';
import { cleanFilters } from '../search/clean-filters';
import { SORT_OPTIONS, SearchRequest } from '../search/search.types';
import { z } from 'zod';

const SearchProductsSchema = z.object({
  productName: z.string().optional().describe(
    'Specific product name e.g. "Air Force 1", "Jordan 4". Do NOT use generic terms like "shoes" or "sneakers" — use category instead.'
  ),
  category: z.enum(['Sneakers', 'Training', 'Lifestyle', 'Basketball', 'Running']).optional().describe(
    'Product category. Use when user mentions a type of footwear or sport.'
  ),
  brand: z.string().optional().describe(
    'Brand name explicitly mentioned e.g. "Nike", "Adidas". Never infer from product type.'
  ),
  colour: z.string().optional().describe(
    'Colour explicitly mentioned e.g. "red", "black". Carry forward from prior searches unless user changes it.'
  ),
  size: z.string().optional().describe(
    'Size value e.g. "8", "XL", "42". Omit if not mentioned.'
  ),
  minPrice: z.number().optional().describe(
    'Minimum price. Set when user says "above", "over", or "more than" a value.'
  ),
  maxPrice: z.number().optional().describe(
    'Maximum price. Set when user says "under", "below", "up to", or "less than" a value.'
  ),
  occasion: z.string().optional().describe(
    'Occasion or activity e.g. "wedding", "party", "gym", "running". Used to rank better fits first, never to hide products. Omit if not mentioned.'
  ),
  gender: z.enum(['male', 'female', 'unisex']).optional().describe(
    'Only three values exist. "male" for men/boys/his, "female" for women/girls/her, "unisex" for unisex/everyone. Omit if the user did not state a gender. Never infer from product type.'
  ),
  keywords: z.array(z.string()).optional().describe(
    'Features or qualities the user wants that no other field covers, as short phrases e.g. ["waterproof", "lightweight", "wide fit", "good arch support"]. Matched against product descriptions to rank better fits first, never to hide products. Omit if none.'
  ),
  sortPreference: z.enum(SORT_OPTIONS).optional().describe(
    '"price_low_to_high" for cheapest/budget, "price_high_to_low" for most expensive/premium, "newest" for latest/new arrivals. Omit for the default (best match first).'
  ),
  page: z.number().int().min(1).optional().describe(
    'Results page, 8 products per page. Set to the next page only when the user asks for more of the SAME search ("show me more", "any others?"). Omit for a new or changed search.'
  ),
});

type SearchProductsArgs = z.infer<typeof SearchProductsSchema>;

function toSearchRequest(args: SearchProductsArgs): SearchRequest {
  return {
    filters: cleanFilters(args),
    sort: args.sortPreference ?? 'relevance',
    page: args.page ?? 1,
  };
}

@Injectable()
export class ToolsService implements OnModuleInit {
  private readonly logger = new Logger(ToolsService.name);
  private ai: any;

  constructor(private readonly searchService: SearchService) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  getTools() {
    if (!this.ai) throw new Error('AI module not initialized');
    const { tool } = this.ai;

    return {
      search_products: tool({
        description: `Search the product catalog.
Extract all relevant fields from the ACTIVE FILTERS in the system prompt and the current message.
Always carry forward filters from ACTIVE FILTERS unless the user explicitly changes them.
For example, if ACTIVE FILTERS show colour: red and the user says "show me something under $50", pass colour="red" AND maxPrice=50.
Never call with all fields omitted — always pass at least the fields shown in ACTIVE FILTERS.
Only in-stock products are returned, 8 per page. If nothing matched exactly, the search loosens filters itself and lists them in droppedFilters / widenedPrice.`,
        inputSchema: SearchProductsSchema,
        execute: async (args: SearchProductsArgs) => {
          this.logger.log(`🛠️ search_products called with: ${JSON.stringify(args)}`);
          return this.searchService.search(toSearchRequest(args));
        },
      } as any),
    };
  }
}
