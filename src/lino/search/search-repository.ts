import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CandidateProduct, CandidateVariant, SearchFilters, SortOption } from './search.types';

// How many products the database hands over per search. Sorting, stock and
// size/colour checks happen in code on this pool.
const CANDIDATE_LIMIT = 200;

const candidateInclude = {
  category: { select: { name: true } },
  subCategory: { select: { name: true } },
  variants: {
    include: {
      inventory: { select: { quantity: true } },
      options: { include: { optionValue: { include: { option: { select: { name: true } } } } } },
    },
  },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof candidateInclude }>;
type VariantRow = ProductRow['variants'][number];

// The only place the search talks to the database.
@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(filters: SearchFilters, sort: SortOption): Promise<CandidateProduct[]> {
    const rows = await this.prisma.product.findMany({
      where: buildWhere(filters),
      orderBy: buildOrderBy(sort),
      take: CANDIDATE_LIMIT,
      include: candidateInclude,
    });
    return rows.map(toCandidateProduct);
  }
}

// Only the filters the database can check cheaply. Size, colour, price and stock are checked per variant in code.
function buildWhere(filters: SearchFilters): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [];

  if (filters.brand) {
    conditions.push({ brand: { equals: filters.brand, mode: 'insensitive' } });
  }
  if (filters.category) {
    conditions.push({
      OR: [
        { category: { is: { name: { equals: filters.category, mode: 'insensitive' } } } },
        { subCategory: { is: { name: { equals: filters.category, mode: 'insensitive' } } } },
      ],
    });
  }
  if (filters.gender) {
    conditions.push({ gender: { in: gendersFor(filters.gender) } });
  }
  if (filters.productName) {
    const contains = { contains: filters.productName, mode: 'insensitive' as const };
    conditions.push({ OR: [{ name: contains }, { modelName: contains }, { description: contains }] });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

// Men's and women's searches also include unisex products.
function gendersFor(gender: string): string[] {
  const wanted = gender.toLowerCase();
  return wanted === 'unisex' ? ['unisex', 'all'] : [wanted, 'unisex', 'all'];
}

// The pool is cut at CANDIDATE_LIMIT, so pre-sort it the way the customer wants.
function buildOrderBy(sort: SortOption): Prisma.ProductOrderByWithRelationInput {
  if (sort === 'price_low_to_high') return { basePrice: 'asc' };
  if (sort === 'price_high_to_low') return { basePrice: 'desc' };
  return { createdAt: 'desc' };
}

function toCandidateProduct(row: ProductRow): CandidateProduct {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    brand: row.brand,
    modelName: row.modelName,
    categoryName: row.category?.name ?? null,
    subCategoryName: row.subCategory?.name ?? null,
    primaryActivity: readPrimaryActivity(row.attributes),
    image: row.images?.[0] ?? null,
    createdAt: row.createdAt,
    variants: row.variants.map(toCandidateVariant),
  };
}

function toCandidateVariant(row: VariantRow): CandidateVariant {
  return {
    price: row.price,
    stock: row.inventory.reduce((total, item) => total + item.quantity, 0),
    size: findOptionValue(row, isSizeOption),
    colour: findOptionValue(row, isColourOption),
  };
}

function findOptionValue(row: VariantRow, isWantedOption: (optionName: string) => boolean): string | null {
  const match = row.options.find((link) => isWantedOption(link.optionValue.option.name));
  return match?.optionValue.value ?? null;
}

// "Size", "Shoe Size" and "US Size" all count as size.
function isSizeOption(optionName: string): boolean {
  return optionName.toLowerCase().includes('size');
}

// "Colour" and "Color" both count as colour.
function isColourOption(optionName: string): boolean {
  const name = optionName.toLowerCase();
  return name.includes('colour') || name.includes('color');
}

function readPrimaryActivity(attributes: Prisma.JsonValue): string | null {
  const useCase = (attributes as any)?.use_case;
  return typeof useCase?.primary_activity === 'string' ? useCase.primary_activity : null;
}
