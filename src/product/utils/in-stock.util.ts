import { Prisma, VariantApprovalStatus } from '@prisma/client';


export const APPROVED_VARIANT_WHERE: Prisma.ProductVariantWhereInput = {
  approvalStatus: VariantApprovalStatus.APPROVED,
};

export const APPROVED_VARIANTS_FILTER = { where: APPROVED_VARIANT_WHERE } as const;

export const APPROVED_DEFAULT_VARIANT_ARGS = {
  where: APPROVED_VARIANT_WHERE,
  orderBy: { isDefault: 'desc' },
  take: 1,
} as const;


export const IN_STOCK_PRODUCT_WHERE: Prisma.ProductWhereInput = {
  variants: { some: { ...APPROVED_VARIANT_WHERE, inventory: { some: { quantity: { gt: 0 } } } } },
};
