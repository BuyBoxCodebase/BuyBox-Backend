import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Intent } from '../dto/intent.schema';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchProductsV2(rawIntent: Intent) {
    this.logger.log(`Searching database for intent: ${JSON.stringify(rawIntent)}`);
    
    // Sanitize the intent to handle models that pass "none", "null", or -1 instead of omitting fields
    const intent: Partial<Intent> = {};
    for (const [key, value] of Object.entries(rawIntent)) {
      if (typeof value === 'string') {
        const cleanVal = value.trim().toLowerCase();
        if (cleanVal !== '' && cleanVal !== 'none' && cleanVal !== 'null') {
          (intent as any)[key] = value.trim();
        }
      } else if (typeof value === 'number') {
        if (value >= 0) {
          (intent as any)[key] = value;
        }
      }
    }
    
    const clean = (str: string) => str.toLowerCase().trim();
    const and: any[] = [];

    // Most filters are pre-computed into searchTags (see generateSearchTags) — match those directly.
    // Each entry is OR-ed within itself and AND-ed with the others.
    const tagFilters: string[][] = [];
    if (intent.category) tagFilters.push([`category:${clean(intent.category)}`, `subcategory:${clean(intent.category)}`]);
    if (intent.brand) tagFilters.push([`brand:${clean(intent.brand)}`]);
    if (intent.colour) tagFilters.push([`color:${clean(intent.colour)}`, `colour:${clean(intent.colour)}`]);
    if (intent.size) tagFilters.push([`size:${clean(intent.size)}`]);
    if (intent.gender) {
      const gender = clean(intent.gender);
      tagFilters.push(gender === 'unisex' ? ['gender:unisex'] : [`gender:${gender}`, 'gender:unisex']);
    }
    for (const tags of tagFilters) {
      and.push({ searchTags: { hasSome: tags } });
    }

    // Free-text product name — match it against name, model name, and description.
    // Generic words like "shoes" aren't product names, so skip them rather than filter everything out.
    if (intent.productName && !clean(intent.productName).includes('shoe')) {
      and.push({
        OR: [
          { name: { contains: intent.productName, mode: 'insensitive' } },
          { modelName: { contains: intent.productName, mode: 'insensitive' } },
          { description: { contains: intent.productName, mode: 'insensitive' } },
        ],
      });
    }

    if (intent.minPrice != null || intent.maxPrice != null) {
      and.push({
        basePrice: {
          ...(intent.minPrice != null && { gte: intent.minPrice }),
          ...(intent.maxPrice != null && { lte: intent.maxPrice }),
        },
      });
    }

    const whereClause = and.length > 0 ? { AND: and } : {};

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
        brand: p.brand,
        modelName: p.modelName,
        gender: p.gender,
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
