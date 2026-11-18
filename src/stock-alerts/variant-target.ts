import { VariantApprovalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normaliseSize } from '../search/query/normalise';
import { findOptionValue, isColourOption, isSizeOption } from '../product/utils/variant-options.util';

// One seller variant read as brand / name / colour / size, plus what the notifier needs to decide whether to message.
// Used both to build a watch-list entry and to match a variant that just became available.
export interface VariantTarget {
  variantId: string;
  brand: string | null;
  name: string; // the product name
  colour: string | null;
  size: string | null; // normalised, e.g. "9.5"
  image: string | null;
  price: number;
  approved: boolean;
  stock: number;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export async function loadVariantTarget(prisma: PrismaService, variantId: string): Promise<VariantTarget | null> {
  if (!OBJECT_ID.test(variantId)) return null;

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      price: true,
      images: true,
      approvalStatus: true,
      product: { select: { name: true, brand: true, images: true } },
      inventory: { select: { quantity: true } },
      // Size and colour live on the variant's option values ("Size: 9", "Colour: White")
      options: { select: { optionValue: { select: { value: true, option: { select: { name: true } } } } } },
    },
  });
  if (!variant) return null;

  const size = findOptionValue(variant, isSizeOption)?.trim();
  return {
    variantId: variant.id,
    brand: variant.product.brand?.trim() || null,
    name: variant.product.name.trim(),
    colour: findOptionValue(variant, isColourOption),
    size: size ? normaliseSize(size) : null,
    image: variant.images[0] ?? variant.product.images[0] ?? null,
    price: variant.price,
    approved: variant.approvalStatus === VariantApprovalStatus.APPROVED,
    stock: variant.inventory.reduce((total, row) => total + row.quantity, 0),
  };
}
