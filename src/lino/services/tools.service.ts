import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';
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
    'Occasion e.g. "wedding", "party", "gym". Omit if not mentioned.'
  ),
  gender: z.string().optional().describe(
    'Gender if explicitly stated e.g. "mens", "womens". Never infer from product type.'
  ),
  sortPreference: z.string().optional().describe(
    'Sort preference e.g. "cheapest", "newest". Omit if not mentioned.'
  ),
});

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
Never call with all fields omitted — always pass at least the fields shown in ACTIVE FILTERS.`,
        inputSchema: SearchProductsSchema,
        execute: async (args: z.infer<typeof SearchProductsSchema>) => {
          this.logger.log(`🛠️ search_products called with: ${JSON.stringify(args)}`);

          const intent = {
            label: null,
            productName: args.productName ?? null,
            category: args.category ?? null,
            brand: args.brand ?? null,
            colour: args.colour ?? null,
            occasion: args.occasion ?? null,
            gender: args.gender ?? null,
            size: args.size ?? null,
            minPrice: args.minPrice ?? null,
            maxPrice: args.maxPrice ?? null,
            currency: null,
            deliveryDate: null,
            sortPreference: args.sortPreference ?? null,
          };

          const results = await this.searchService.searchProductsV2(intent);
          return { results_found: results.length, products: results };
        },
      } as any),

      check_stock: tool({
        description: 'Check if a specific product variant is in stock.',
        inputSchema: z.object({
          productId: z.string().describe('The product ID to check stock for.'),
        }),
        execute: async ({ productId }: { productId: string }) => {
          return { productId, status: 'In Stock', quantity: 15 };
        },
      } as any),
    };
  }
}
