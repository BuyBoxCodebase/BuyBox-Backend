import { ProductSearchDoc, SearchDocVariant } from '../db/search-models';

// A product returned by retrieval, as plain values (no ObjectIds or Dates).
export interface Candidate {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  subCategory: string | null;
  categoryId: string | null;
  subCategoryId: string | null;
  description: string;
  image: string | null;
  variants: SearchDocVariant[];
  createdAt: number;
}

export function toCandidate(doc: Omit<ProductSearchDoc, 'embedding'>): Candidate {
  return {
    id: String(doc._id),
    name: doc.name,
    brand: doc.brand ?? null,
    category: doc.category ?? null,
    subCategory: doc.subCategory ?? null,
    categoryId: doc.categoryId ?? null,
    subCategoryId: doc.subCategoryId ?? null,
    description: doc.description ?? '',
    image: doc.image ?? null,
    variants: (doc.variants ?? []).map(({ variantId, price, size, colour, images }) => ({
      variantId,
      price,
      size: size ?? null,
      colour: colour ?? null,
      images: images ?? [],
    })),
    createdAt: new Date(doc.productCreatedAt).getTime(),
  };
}
