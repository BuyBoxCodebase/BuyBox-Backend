import { Connection, Model, Schema, Types } from 'mongoose';

// The search reads the catalog collections that Prisma owns (collection names = Prisma model names)
// and owns one collection of its own, ProductSearchDoc. Only ProductSearchDoc and SearchSynonym are written here.

// strictQuery: false keeps filters on fields these empty schemas don't declare (e.g. variantId).
const READ_ONLY = { strict: false, strictQuery: false, versionKey: false } as const;

export interface ProductRow {
  _id: Types.ObjectId;
  sellerId: Types.ObjectId;
  name: string;
  description: string;
  images: string[];
  categoryId: Types.ObjectId | null;
  subCategoryId: Types.ObjectId | null;
  basePrice: number;
  brand: string | null;
  modelName: string | null;
  gender: string | null;
  attributes: Record<string, any> | null;
  createdAt: Date;
}

export interface VariantRow {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  price: number;
  isDefault: boolean;
  images: string[];
}

export interface InventoryRow {
  _id: Types.ObjectId;
  variantId: Types.ObjectId | null;
  quantity: number;
}

export interface VariantOptionRow {
  _id: Types.ObjectId;
  variantId: Types.ObjectId;
  optionValueId: Types.ObjectId;
}

export interface OptionValueRow {
  _id: Types.ObjectId;
  optionId: Types.ObjectId;
  value: string;
}

export interface OptionRow {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  name: string;
}

export interface CategoryRow {
  _id: Types.ObjectId;
  name: string;
}

// One variant as stored in the search document. Stock is not stored: it is always read live.
export interface SearchDocVariant {
  variantId: string;
  price: number;
  size: string | null;
  colour: string | null;
  images: string[];
}

export interface ProductSearchDoc {
  _id: Types.ObjectId; // same id as the product
  sellerId: Types.ObjectId;
  name: string;
  brand: string | null;
  modelName: string | null;
  category: string | null;
  subCategory: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  description: string;
  gender: string | null;
  image: string | null;

  // Filter fields, built from the variants that were in stock when the product was indexed.
  brandKey: string | null;
  categoryKeys: string[];
  colourKeys: string[];
  sizeKeys: string[];
  minPrice: number;
  maxPrice: number;

  variants: SearchDocVariant[];
  embedding: number[];
  embeddingHash: string; // hash of the embedded text, so unchanged products are not embedded again
  productCreatedAt: Date;
  indexedAt: Date;
}

export interface SearchSynonym {
  mappingType: 'equivalent';
  synonyms: string[];
}

const searchDocVariantSchema = new Schema<SearchDocVariant>(
  {
    variantId: String,
    price: Number,
    size: String,
    colour: String,
    images: [String],
  },
  { _id: false },
);

const productSearchDocSchema = new Schema<ProductSearchDoc>(
  {
    _id: Schema.Types.ObjectId,
    sellerId: Schema.Types.ObjectId,
    name: String,
    brand: String,
    modelName: String,
    category: String,
    subCategory: String,
    categoryId: String,
    subCategoryId: String,
    description: String,
    gender: String,
    image: String,
    brandKey: String,
    categoryKeys: [String],
    colourKeys: [String],
    sizeKeys: [String],
    minPrice: Number,
    maxPrice: Number,
    variants: [searchDocVariantSchema],
    embedding: [Number],
    embeddingHash: String,
    productCreatedAt: Date,
    indexedAt: Date,
  },
  { collection: 'ProductSearchDoc', versionKey: false },
);
productSearchDocSchema.index({ sellerId: 1 });

const searchSynonymSchema = new Schema<SearchSynonym>(
  { mappingType: String, synonyms: [String] },
  { collection: 'SearchSynonym', versionKey: false },
);

export interface SearchModels {
  Product: Model<ProductRow>;
  ProductVariant: Model<VariantRow>;
  Inventory: Model<InventoryRow>;
  VariantOption: Model<VariantOptionRow>;
  ProductOptionValue: Model<OptionValueRow>;
  ProductOption: Model<OptionRow>;
  Category: Model<CategoryRow>;
  SubCategory: Model<CategoryRow>;
  ProductSearchDoc: Model<ProductSearchDoc>;
  SearchSynonym: Model<SearchSynonym>;
}

function readOnlyModel<T>(connection: Connection, name: string): Model<T> {
  return connection.model<T>(name, new Schema<T>({}, { ...READ_ONLY, collection: name }));
}

export function registerSearchModels(connection: Connection): SearchModels {
  return {
    Product: readOnlyModel<ProductRow>(connection, 'Product'),
    ProductVariant: readOnlyModel<VariantRow>(connection, 'ProductVariant'),
    Inventory: readOnlyModel<InventoryRow>(connection, 'Inventory'),
    VariantOption: readOnlyModel<VariantOptionRow>(connection, 'VariantOption'),
    ProductOptionValue: readOnlyModel<OptionValueRow>(connection, 'ProductOptionValue'),
    ProductOption: readOnlyModel<OptionRow>(connection, 'ProductOption'),
    Category: readOnlyModel<CategoryRow>(connection, 'Category'),
    SubCategory: readOnlyModel<CategoryRow>(connection, 'SubCategory'),
    ProductSearchDoc: connection.model<ProductSearchDoc>('ProductSearchDoc', productSearchDocSchema),
    SearchSynonym: connection.model<SearchSynonym>('SearchSynonym', searchSynonymSchema),
  };
}
