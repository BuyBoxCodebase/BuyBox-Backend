import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SearchService } from './search.service';
import { IntentService } from './intent.service';

@Injectable()
export class ToolsService implements OnModuleInit {
  private readonly logger = new Logger(ToolsService.name);
  private ai: any;

  constructor(
    private readonly searchService: SearchService,
    private readonly intentService: IntentService
  ) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  getTools(lastUserMessage: string) {
    if (!this.ai) throw new Error('AI module not initialized');
    const { tool, jsonSchema } = this.ai;

    return {
      search_products: tool({
        description: 'Search the product catalog based on the user\'s raw query. Automatically parses intent and returns matched products.',
        parameters: jsonSchema({
          type: 'object',
          properties: {
            rawQuery: {
              type: 'string',
              description: 'The user\'s search query or constraint (e.g. "Nike shoes for a party under $30")'
            }
          },
          required: ['rawQuery']
        }),
        execute: async (args, options) => {
          console.log("🛠️ Tool Executed! Args received:", args);
          const rawQuery = (args as any)?.rawQuery || (args as any)?.query || lastUserMessage;
          console.log("🔍 Final rawQuery being used:", rawQuery);
          
          // Parse the raw query into a structured Intent
          const intent = await this.intentService.parseIntent(rawQuery);
          // Query the DB using V2 internally
          const results = await this.searchService.searchProductsV2(intent);
          return {
            intent_understood: intent,
            results_found: results.length,
            products: results
          };
        }
      } as any),
      // Other tools like check_stock, check_size can be added here
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
