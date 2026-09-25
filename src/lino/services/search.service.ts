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
    if (intent.productName) {
      const searchTerm = intent.productName;
      whereClause.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { labels: { has: searchTerm.toLowerCase() } },
        { description: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (intent.minPrice != null || intent.maxPrice != null) {
      whereClause.basePrice = {};
      if (intent.minPrice != null) whereClause.basePrice.gte = intent.minPrice;
      if (intent.maxPrice != null) whereClause.basePrice.lte = intent.maxPrice;
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

  async searchProductsV2(intent: Intent) {
    this.logger.log(`Searching database for intent: ${JSON.stringify(intent)}`);
    
    // Construct Prisma query based on extracted intent
    const whereClause: any = { AND: [] };

    const clean = (str: string) => str.toLowerCase().trim();

    // Text search fallback to name, description, or searchTags matching general term
    if (intent.productName) {
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

    if (intent.brand) {
      const termClean = clean(intent.brand);
      whereClause.AND.push({
        OR: [
          { brand: { name: { contains: intent.brand, mode: 'insensitive' } } },
          { name: { contains: intent.brand, mode: 'insensitive' } },
          { description: { contains: intent.brand, mode: 'insensitive' } },
          { searchTags: { hasSome: [`brand:${termClean}`, termClean] } }
        ]
      });
    }

    if (intent.category) {
      const termClean = clean(intent.category);
      whereClause.AND.push({
        OR: [
          { category: { name: { contains: intent.category, mode: 'insensitive' } } },
          { subCategory: { name: { contains: intent.category, mode: 'insensitive' } } },
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
