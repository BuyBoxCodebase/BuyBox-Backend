import { Injectable } from '@nestjs/common';
import { getSearchModels } from '../db/search-connection';
import { canonicalColour, normaliseKey, normaliseSize } from '../query/normalise';
import { Vocabulary, VocabularyEntry } from '../query/parse-query';
import { GENDERS, Gender, SearchFilters } from '../search.types';

// Filters as an AI model or a URL sends them: any strings, possibly not catalog values.
export interface RawFilters {
  brand?: string;
  category?: string;
  gender?: string;
  colour?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
}

// The brands and categories that exist in the searchable catalog.
@Injectable()
export class CatalogVocabulary {
  async get(): Promise<Vocabulary> {
    const { ProductSearchDoc } = await getSearchModels();
    const [brands, categories, subCategories] = await Promise.all([
      ProductSearchDoc.distinct('brand'),
      ProductSearchDoc.distinct('category'),
      ProductSearchDoc.distinct('subCategory'),
    ]);
    return {
      brands: toEntries(brands),
      categories: toEntries([...categories, ...subCategories]),
    };
  }

  // Keeps only values the catalog knows. Unknown brands/categories/colours are returned as text,
  // so they still help the search as words instead of filtering everything out.
  // Pass the vocabulary when the caller already loaded it.
  async resolveFilters(
    raw: RawFilters,
    vocabulary?: Vocabulary,
  ): Promise<{ filters: SearchFilters; unknownText: string[] }> {
    vocabulary ??= await this.get();
    const filters: SearchFilters = {};
    const unknownText: string[] = [];

    const brand = raw.brand && findEntry(vocabulary.brands, raw.brand);
    if (brand) filters.brand = brand;
    else if (raw.brand) unknownText.push(raw.brand);

    const category = raw.category && findEntry(vocabulary.categories, raw.category);
    if (category) filters.category = category;
    else if (raw.category) unknownText.push(raw.category);

    const colour = raw.colour && canonicalColour(raw.colour.trim());
    if (colour) filters.colour = colour;
    else if (raw.colour) unknownText.push(raw.colour);

    const gender = raw.gender?.toLowerCase();
    if ((GENDERS as readonly string[]).includes(gender)) filters.gender = gender as Gender;

    if (raw.size?.trim()) filters.size = normaliseSize(raw.size.trim());
    if (isPrice(raw.minPrice)) filters.minPrice = raw.minPrice;
    if (isPrice(raw.maxPrice)) filters.maxPrice = raw.maxPrice;

    return { filters, unknownText };
  }
}

function toEntries(labels: (string | null)[]): VocabularyEntry[] {
  const entries = new Map<string, VocabularyEntry>();
  for (const label of labels) {
    const key = normaliseKey(label);
    if (key && !entries.has(key)) entries.set(key, { key, label });
  }
  return [...entries.values()];
}

function findEntry(entries: VocabularyEntry[], value: string): string | null {
  const key = normaliseKey(value);
  return entries.find((entry) => entry.key === key)?.label ?? null;
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
