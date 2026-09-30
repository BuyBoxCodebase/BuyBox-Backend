import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';

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
    const { tool, jsonSchema } = this.ai;

    return {
      search_products: tool({
        description: `Search the product catalog. Extract all relevant fields from the conversation context and pass them directly.
Infer values from the full conversation — not just the latest message.
For example, if the user previously asked for "red Nike shoes" and now says "show me something under $50",
you should pass colour="red", brand="Nike", maxPrice=50 together.`,
        parameters: jsonSchema({
          type: 'object',
          properties: {
            productName: {
              type: 'string',
              description: 'Specific product name (e.g. "Air Force 1", "Puma 350"). Do NOT use generic terms like "shoes" or "sneakers" here — use category instead. Omit if not mentioned.'
            },
            category: {
              type: 'string',
              enum: ['Sneakers', 'Training', 'Lifestyle', 'Basketball', 'Running'],
              description: 'Product category. Omit if not clearly applicable.'
            },
            brand: {
              type: 'string',
              description: 'Brand name explicitly mentioned (e.g. "Nike", "Adidas"). Omit if not mentioned.'
            },
            colour: {
              type: 'string',
              description: 'Colour explicitly mentioned (e.g. "red", "black"). Carry forward from prior turns if still relevant.'
            },
            size: {
              type: 'string',
              description: 'Size value (e.g. "8", "XL", "42"). Omit if not mentioned.'
            },
            minPrice: {
              type: 'number',
              description: 'Minimum price if the user set a lower bound (e.g. "above $50" → 50). Omit if not mentioned.'
            },
            maxPrice: {
              type: 'number',
              description: 'Maximum price if the user set an upper bound (e.g. "under $100" → 100). Omit if not mentioned.'
            },
            occasion: {
              type: 'string',
              description: 'Occasion mentioned (e.g. "wedding", "party", "gym"). Omit if not mentioned.'
            },
            gender: {
              type: 'string',
              description: 'Gender if explicitly stated (e.g. "mens", "womens"). Omit if not mentioned.'
            },
            sortPreference: {
              type: 'string',
              description: 'Sort preference like "cheap", "newest". Omit if not mentioned.'
            }
          },
          required: []
        }),
        execute: async (args: any) => {
          this.logger.log(`🛠️ search_products called with: ${JSON.stringify(args)}`);

          // Map tool args directly into the Intent shape SearchService already understands
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

          return {
            results_found: results.length,
            products: results,
          };
        }
      } as any),

      check_stock: tool({
        description: 'Check if a specific product variant is in stock.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            productId: { type: 'string' }
          },
          required: ['productId']
        }),
        execute: async ({ productId }: { productId: string }) => {
          return { productId, status: 'In Stock', quantity: 15 }; // Placeholder
        }
      } as any)
    };
  }
}
