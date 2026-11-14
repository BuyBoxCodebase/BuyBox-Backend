import { Prisma } from '@prisma/client';
import { APPROVED_VARIANT_WHERE } from './in-stock.util';

// Shape of the product cards on category / subcategory listing pages.
export const LISTING_INCLUDE = {
  category: true,
  subCategory: true,
  inventory: { select: { quantity: true } },
  variants: {
    where: APPROVED_VARIANT_WHERE,
    include: {
      inventory: true,
      options: { include: { optionValue: { include: { option: true } } } },
    },
  },
} satisfies Prisma.ProductInclude;

export type ListingProduct = Prisma.ProductGetPayload<{ include: typeof LISTING_INCLUDE }>;

export const mapListingProducts = (products: ListingProduct[]) =>
  products.map((product) => {
    const defaultVariant = product.variants.find((v) => v.isDefault) || product.variants[0] || null;

    const simplifiedVariants = product.variants.map((variant) => {
      const formattedOptions = variant.options.reduce((acc, opt) => {
        acc[opt.optionValue.option.name] = {
          id: opt.optionValueId,
          value: opt.optionValue.value,
          optionId: opt.optionValue.optionId,
        };
        return acc;
      }, {} as Record<string, { id: string; value: string; optionId: string }>);

      return {
        id: variant.id,
        price: variant.price,
        quantity: variant.inventory && variant.inventory.length > 0 ? variant.inventory[0].quantity : 0,
        formattedOptions,
      };
    });

    return {
      ...product,
      price: defaultVariant?.price || product.basePrice,
      inventory:
        defaultVariant?.inventory && defaultVariant.inventory.length > 0
          ? { quantity: defaultVariant.inventory[0].quantity }
          : product.inventory && product.inventory.length > 0
            ? { quantity: product.inventory[0].quantity }
            : { quantity: 0 },
      defaultVariant: defaultVariant
        ? {
          id: defaultVariant.id,
          price: defaultVariant.price,
          quantity:
            defaultVariant.inventory && defaultVariant.inventory.length > 0
              ? defaultVariant.inventory[0].quantity
              : 0,
        }
        : null,
      variants: simplifiedVariants,
    };
  });

export const MAX_LISTING_PAGE_SIZE = 60;
export const DEFAULT_LISTING_PAGE_SIZE = 20;

export const parsePaging = (page?: string, pageSize?: string) => {
  if (page === undefined && pageSize === undefined) return null;
  const p = Math.max(1, Math.floor(Number(page)) || 1);
  const size = Math.min(
    MAX_LISTING_PAGE_SIZE,
    Math.max(1, Math.floor(Number(pageSize)) || DEFAULT_LISTING_PAGE_SIZE),
  );
  return { page: p, pageSize: size };
};
