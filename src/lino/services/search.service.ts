import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Intent } from '../dto/intent.schema';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(intent: Intent) {
    this.logger.log(`Searching database for intent: ${JSON.stringify(intent)}`);
    
    // Construct Prisma query based on extracted intent
    const whereClause: any = {};

    // Basic text search on name or labels
    if (intent.product || intent.label) {
      const searchTerm = intent.product || intent.label;
      whereClause.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { labels: { has: searchTerm.toLowerCase() } },
        { description: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (intent.minPrice !== undefined || intent.maxPrice !== undefined) {
      whereClause.basePrice = {};
      if (intent.minPrice !== undefined) whereClause.basePrice.gte = intent.minPrice;
      if (intent.maxPrice !== undefined) whereClause.basePrice.lte = intent.maxPrice;
    }

    // We can also join variants if we need to filter by size or color
    if (intent.size || intent.colour) {
      whereClause.variants = {
        some: {}
      };
      // Note: A more complex query on ProductOptionValue might be needed depending on how exact data is stored
      // For now, we search within Variant properties if they exist
    }
    console.log(JSON.stringify(whereClause,null,2));
    try {
      const products = await this.prisma.product.findMany({
        where: whereClause,
        take: 10,
        include: {
          brand: true,
          variants: {
            include: {
              inventory: true
            }
          }
        },
        // We'll skip complex custom sorting here and let the AI process the top 10 returned
      });

      return products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.basePrice,
        brand: p.brand.name,
        availableVariants: p.variants.length,
        image: p.images && p.images.length > 0 ? p.images[0] : null
      }));
    } catch (error) {
      this.logger.error('Error executing product search query', error);
      throw error;
    }
  }
}
