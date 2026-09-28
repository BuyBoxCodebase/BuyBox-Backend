import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Intent } from '../dto/intent.schema';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchProductsV2(intent: Intent) {
    this.logger.log(`Searching database for intent: ${JSON.stringify(intent)}`);
    
    // Construct Prisma query based on extracted intent
    const whereClause: any = { AND: [] };

    const clean = (str: string) => str.toLowerCase().trim();

    // Text search fallback to name, description, or searchTags matching general term
    if (intent.productName && !intent.productName.toLowerCase().includes("shoe")) {
      const searchTerm = intent.productName;
      const termClean = clean(searchTerm);
      whereClause.AND.push({
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { labels: { has: termClean } },
          { description: { contains: searchTerm, mode: 'insensitive' } },
          { searchTags: { hasSome: [termClean] } }
        ]
      });
    }

    if (intent.category) {
      const termClean = clean(intent.category);
      whereClause.AND.push({
        OR: [
          { name: { contains: intent.category, mode: 'insensitive' } },
          { description: { contains: intent.category, mode: 'insensitive' } },
          { searchTags: { hasSome: [`category:${termClean}`, `subcategory:${termClean}`, termClean] } }
        ]
      });
    }

    if (intent.colour) {
      const termClean = clean(intent.colour);
      whereClause.AND.push({
        OR: [
          { name: { contains: intent.colour, mode: 'insensitive' } },
          { description: { contains: intent.colour, mode: 'insensitive' } },
          { searchTags: { hasSome: [`color:${termClean}`, termClean] } }
        ]
      });
    }

    if (intent.size) {
      const termClean = clean(intent.size);
      whereClause.AND.push({
        OR: [
          { name: { contains: intent.size, mode: 'insensitive' } },
          { description: { contains: intent.size, mode: 'insensitive' } },
          { searchTags: { hasSome: [`size:${termClean}`, termClean] } }
        ]
      });
    }

    if (intent.minPrice != null || intent.maxPrice != null) {
      const priceFilter: any = {};
      if (intent.minPrice != null) priceFilter.gte = intent.minPrice;
      if (intent.maxPrice != null) priceFilter.lte = intent.maxPrice;
      whereClause.AND.push({ basePrice: priceFilter });
    }

    if (whereClause.AND.length === 0) {
      delete whereClause.AND;
    }

    console.log(JSON.stringify(whereClause, null, 2));
    try {
      const products = await this.prisma.product.findMany({
        where: whereClause,
        take: 10,
        include: {
          variants: {
            include: {
              inventory: true
            }
          }
        },
      });

      return products.map(p => ({
        id: p.id,
        name: p.name,
        price: p.basePrice,
        availableVariants: p.variants.length,
        image: p.images && p.images.length > 0 ? p.images[0] : null
      }));
    } catch (error) {
      this.logger.error('Error executing product search query', error);
      throw error;
    }
  }
}
