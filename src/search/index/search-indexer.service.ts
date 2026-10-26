import { Injectable, Logger } from '@nestjs/common';
import { AnyBulkWriteOperation, Types } from 'mongoose';
import { getSearchModels } from '../db/search-connection';
import { ProductRow, ProductSearchDoc, SearchDocVariant, SearchModels } from '../db/search-models';
import { EmbeddingService } from '../retrieval/embedding.service';
import { buildSearchDoc, ProductData, SearchDocFields, toObjectId } from './search-doc-builder';
import { SEARCH_SYNONYMS } from './search-synonyms';
import { findOptionValue, isColourOption, isSizeOption } from '../../product/utils/variant-options.util';

const REBUILD_CHUNK = 200;

type OptionValue = { value: string; option: { name: string } };

export interface RebuildResult {
  indexed: number;
  embedded: number;
  removed: number;
}

// Keeps ProductSearchDoc in step with the catalog.
//
// Product and inventory writes call reindexProduct after they succeed. Those calls never throw:
// a search index problem must not fail a seller's product update. POST /search/reindex rebuilds
// everything as a safety net.
@Injectable()
export class SearchIndexer {
  private readonly logger = new Logger(SearchIndexer.name);

  constructor(private readonly embeddings: EmbeddingService) {}

  async reindexProduct(productId: string): Promise<void> {
    try {
      const models = await getSearchModels();
      await this.indexProducts(models, [toObjectId(productId)]);
    } catch (error) {
      this.logger.error(`Could not re-index product ${productId}`, error);
    }
  }

  // For products that were deleted without their id at hand (e.g. "delete all my products").
  async removeSellerProducts(sellerId: string): Promise<void> {
    try {
      const models = await getSearchModels();
      const productIds = await models.Product.distinct('_id', { sellerId: toObjectId(sellerId) });
      await models.ProductSearchDoc.deleteMany({ sellerId: toObjectId(sellerId), _id: { $nin: productIds } });
    } catch (error) {
      this.logger.error(`Could not remove search documents of seller ${sellerId}`, error);
    }
  }

  async rebuildAll(): Promise<RebuildResult> {
    const models = await getSearchModels();
    await this.seedSynonyms(models);

    const productIds = (await models.Product.find({}, { _id: 1 }).lean()).map((row) => row._id);
    const totals: RebuildResult = { indexed: 0, embedded: 0, removed: 0 };

    for (let start = 0; start < productIds.length; start += REBUILD_CHUNK) {
      const result = await this.indexProducts(models, productIds.slice(start, start + REBUILD_CHUNK));
      totals.indexed += result.indexed;
      totals.embedded += result.embedded;
      totals.removed += result.removed;
      this.logger.log(`Indexed ${Math.min(start + REBUILD_CHUNK, productIds.length)} / ${productIds.length} products`);
    }

    // Documents of products that no longer exist.
    const orphans = await models.ProductSearchDoc.deleteMany({ _id: { $nin: productIds } });
    totals.removed += orphans.deletedCount;
    return totals;
  }

  // Indexes the given products: in-stock ones are written, the rest are removed.
  // Only products whose text changed are sent to the embedding API.
  private async indexProducts(models: SearchModels, productIds: Types.ObjectId[]): Promise<RebuildResult> {
    const data = await loadProductData(models, productIds);
    const built = data.map(buildSearchDoc);

    const searchable = built.filter(Boolean) as { doc: SearchDocFields; embedText: string }[];
    const searchableIds = new Set(searchable.map(({ doc }) => String(doc._id)));
    const removeIds = productIds.filter((id) => !searchableIds.has(String(id)));

    const existing = await models.ProductSearchDoc.find(
      { _id: { $in: searchable.map(({ doc }) => doc._id) } },
      { embeddingHash: 1 },
    ).lean();
    const existingHash = new Map(existing.map((row) => [String(row._id), row.embeddingHash]));

    const needEmbedding = searchable.filter(({ doc }) => existingHash.get(String(doc._id)) !== doc.embeddingHash);
    const vectors = await this.embeddings.embedMany(needEmbedding.map(({ embedText }) => embedText));
    const vectorById = new Map(needEmbedding.map(({ doc }, i) => [String(doc._id), vectors[i]]));

    const now = new Date();
    const operations: AnyBulkWriteOperation<ProductSearchDoc>[] = searchable.map(({ doc }) => {
      const { _id, ...fields } = doc;
      const embedding = vectorById.get(String(_id));
      return {
        updateOne: {
          filter: { _id },
          update: { $set: { ...fields, indexedAt: now, ...(embedding ? { embedding } : {}) } },
          upsert: true,
        },
      };
    });
    if (removeIds.length > 0) {
      operations.push({ deleteMany: { filter: { _id: { $in: removeIds } } } });
    }
    if (operations.length > 0) await models.ProductSearchDoc.bulkWrite(operations, { ordered: false });

    return { indexed: searchable.length, embedded: needEmbedding.length, removed: removeIds.length };
  }

  private async seedSynonyms(models: SearchModels) {
    await models.SearchSynonym.deleteMany({});
    await models.SearchSynonym.insertMany(SEARCH_SYNONYMS.map((synonyms) => ({ mappingType: 'equivalent', synonyms })));
  }
}

// Loads products with their category names, variants (size/colour from options) and live stock.
async function loadProductData(models: SearchModels, productIds: Types.ObjectId[]): Promise<ProductData[]> {
  const products = (await models.Product.find({ _id: { $in: productIds } }).lean()) as ProductRow[];
  if (products.length === 0) return [];

  const categoryIds = unique(products.map((p) => p.categoryId));
  const subCategoryIds = unique(products.map((p) => p.subCategoryId));
  const [categories, subCategories, variants] = await Promise.all([
    models.Category.find({ _id: { $in: categoryIds } }, { name: 1 }).lean(),
    models.SubCategory.find({ _id: { $in: subCategoryIds } }, { name: 1 }).lean(),
    models.ProductVariant.find({ productId: { $in: products.map((p) => p._id) } }).lean(),
  ]);

  const variantIds = variants.map((v) => v._id);
  const [inventory, variantOptions] = await Promise.all([
    models.Inventory.find({ variantId: { $in: variantIds } }, { variantId: 1, quantity: 1 }).lean(),
    models.VariantOption.find({ variantId: { $in: variantIds } }).lean(),
  ]);

  const optionValues = await models.ProductOptionValue.find({
    _id: { $in: unique(variantOptions.map((vo) => vo.optionValueId)) },
  }).lean();
  const options = await models.ProductOption.find({ _id: { $in: unique(optionValues.map((ov) => ov.optionId)) } }).lean();

  const nameById = new Map([...categories, ...subCategories].map((c) => [String(c._id), c.name]));
  const optionNameById = new Map(options.map((o) => [String(o._id), o.name]));
  const optionValueById = new Map<string, OptionValue>(
    optionValues.map((ov) => [String(ov._id), { value: ov.value, option: { name: optionNameById.get(String(ov.optionId)) ?? '' } }]),
  );

  const stockByVariant = new Map<string, number>();
  for (const row of inventory) {
    const id = String(row.variantId);
    stockByVariant.set(id, (stockByVariant.get(id) ?? 0) + (row.quantity ?? 0));
  }

  const linksByVariant = groupBy(variantOptions, (vo) => String(vo.variantId));
  const variantsByProduct = groupBy(variants, (v) => String(v.productId));

  return products.map((product) => ({
    product,
    categoryName: product.categoryId ? nameById.get(String(product.categoryId)) ?? null : null,
    subCategoryName: product.subCategoryId ? nameById.get(String(product.subCategoryId)) ?? null : null,
    stockByVariant,
    variants: (variantsByProduct.get(String(product._id)) ?? []).map((variant): SearchDocVariant => {
      const row = { options: [] as { optionValue: OptionValue }[] };
      for (const link of linksByVariant.get(String(variant._id)) ?? []) {
        const optionValue = optionValueById.get(String(link.optionValueId));
        if (optionValue) row.options.push({ optionValue });
      }
      return {
        variantId: String(variant._id),
        price: variant.price,
        size: findOptionValue(row, isSizeOption),
        colour: findOptionValue(row, isColourOption),
        images: variant.images ?? [],
      };
    }),
  }));
}

function unique(ids: (Types.ObjectId | null | undefined)[]): Types.ObjectId[] {
  const seen = new Map<string, Types.ObjectId>();
  for (const id of ids) if (id) seen.set(String(id), id);
  return [...seen.values()];
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}
