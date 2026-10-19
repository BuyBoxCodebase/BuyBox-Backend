import { Prisma } from '@prisma/client';

// Customer-facing listings no longer serve out-of-stock products.
// A product is in stock when its own inventory or any of its variants' inventory has quantity > 0
// (variant inventory rows aren't linked to the product directly, so both paths are checked).
export const IN_STOCK_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  OR: [
    { inventory: { some: { quantity: { gt: 0 } } } },
    { variants: { some: { inventory: { some: { quantity: { gt: 0 } } } } } },
  ],
};
