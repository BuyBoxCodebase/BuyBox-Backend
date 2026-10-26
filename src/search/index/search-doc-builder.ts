import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { ProductRow, ProductSearchDoc, SearchDocVariant } from '../db/search-models';
import { colourWords, normaliseKey, normaliseSize } from '../query/normalise';

// Builds the search document for one product. Pure: all data is passed in.

export interface ProductData {
  product: ProductRow;
  categoryName: string | null;
  subCategoryName: string | null;
  variants: SearchDocVariant[];
  stockByVariant: Map<string, number>;
}

export type SearchDocFields = Omit<ProductSearchDoc, 'embedding' | 'indexedAt'>;

const DESCRIPTION_WORD_LIMIT = 1500; // well under the embedding model's input limit

// Attribute keys that say nothing about what the product is like.
const SKIPPED_ATTRIBUTES = new Set(['style_code', 'sizing_system', 'model_generation']);

// Returns null when the product has no in-stock variant: it must not be searchable.
export function buildSearchDoc(data: ProductData): { doc: SearchDocFields; embedText: string } | null {
  const { product, categoryName, subCategoryName, variants, stockByVariant } = data;
  const inStock = variants.filter((variant) => (stockByVariant.get(variant.variantId) ?? 0) > 0);
  if (inStock.length === 0) return null;

  const prices = inStock.map((variant) => variant.price);
  const embedText = buildEmbedText(data, inStock);

  const doc: SearchDocFields = {
    _id: product._id,
    sellerId: product.sellerId,
    name: product.name,
    brand: product.brand ?? null,
    modelName: product.modelName ?? null,
    category: categoryName,
    subCategory: subCategoryName,
    categoryId: product.categoryId ? String(product.categoryId) : null,
    subCategoryId: product.subCategoryId ? String(product.subCategoryId) : null,
    description: product.description ?? '',
    gender: product.gender ?? null,
    image: product.images?.[0] ?? inStock.find((variant) => variant.images.length > 0)?.images[0] ?? null,
    brandKey: normaliseKey(product.brand),
    categoryKeys: unique([normaliseKey(categoryName), normaliseKey(subCategoryName)]),
    colourKeys: unique(inStock.flatMap((variant) => colourWords(variant.colour))),
    sizeKeys: unique(inStock.map((variant) => (variant.size ? normaliseSize(variant.size) : null))),
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    variants,
    embeddingHash: createHash('sha1').update(embedText).digest('hex'),
    productCreatedAt: product.createdAt,
  };

  return { doc, embedText };
}

// The text whose meaning is stored as the product's vector. Sizes and prices are left out:
// they are exact filters, and stock changes must not require a new embedding.
function buildEmbedText(data: ProductData, inStock: SearchDocVariant[]): string {
  const { product, categoryName, subCategoryName } = data;
  const colours = unique(inStock.map((variant) => variant.colour));

  return [
    product.name,
    product.brand && `Brand: ${product.brand}.`,
    product.modelName && `Model: ${product.modelName}.`,
    (categoryName || subCategoryName) && `Category: ${unique([categoryName, subCategoryName]).join(', ')}.`,
    product.gender && `For: ${genderLabel(product.gender)}.`,
    colours.length > 0 && `Colours: ${colours.join(', ')}.`,
    describeAttributes(product.attributes),
    firstWords(product.description ?? '', DESCRIPTION_WORD_LIMIT),
  ]
    .filter(Boolean)
    .join('\n');
}

// {"use_case": {"cushioning_level": "maximum"}} -> "Cushioning level: maximum."
function describeAttributes(attributes: Record<string, any> | null): string | null {
  if (!attributes || typeof attributes !== 'object') return null;

  const lines: string[] = [];
  const visit = (value: unknown, key: string) => {
    if (SKIPPED_ATTRIBUTES.has(key)) return;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [childKey, child] of Object.entries(value)) visit(child, childKey);
    } else if (typeof value === 'string' && value.trim()) {
      lines.push(`${humanise(key)}: ${value.trim()}.`);
    }
  };
  for (const [key, value] of Object.entries(attributes)) visit(value, key);

  return lines.length > 0 ? lines.join(' ') : null;
}

function genderLabel(gender: string): string {
  if (gender === 'male') return 'men';
  if (gender === 'female') return 'women';
  return 'everyone (unisex)';
}

function humanise(key: string): string {
  const text = key.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function firstWords(text: string, limit: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= limit ? text.trim() : words.slice(0, limit).join(' ');
}

function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
}

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
