import { z } from 'zod';

export const IntentSchema = z.object({
  productName: z
    .string()
    .nullable()
    .describe('Specific product name explicitly mentioned by the user (e.g. "puma 350", "iphone 14"). NOTE: generic terms like "shoes", "sneaker", or "gym" are NOT product names. If only generic terms are used, return null for productName.'),

  subCategory: z
    .string()
    .nullable()
    .describe('Product subcategory explicitly mentioned or clearly supported by the request, matching the catalogue subcategory name when possible; otherwise null.'),

  brand: z
    .string()
    .nullable()
    .describe('Brand explicitly mentioned by the user, or null if none'),

  colour: z
    .string()
    .nullable()
    .describe('Color explicitly mentioned by the user, or null if none'),

  occasion: z
    .string()
    .nullable()
    .describe('Occasion explicitly mentioned by the user, or null if none'),

  useCase: z
    .string()
    .nullable()
    .describe('Activity the product is needed for, explicitly mentioned by the user, or null if none'),

  outfitColour: z
    .string()
    .nullable()
    .describe('Colour of the user\'s outfit or surrounding context, not the product, or null if none'),

  gender: z
    .string()
    .nullable()
    .describe('Gender explicitly mentioned by the user, or null if none'),

  size: z
    .string()
    .nullable()
    .describe('Exact size value explicitly mentioned by the user (e.g., "8", "XL", "42"). Extract ONLY the value without surrounding words like "size" or "use", or null if none'),

  sizeSystem: z
    .string()
    .nullable()
    .describe('Sizing system explicitly mentioned by the user, or null if none'),

  material: z
    .string()
    .nullable()
    .describe('Product material explicitly mentioned by the user, or null if none'),

  style: z
    .string()
    .nullable()
    .describe('Product style explicitly mentioned by the user, or null if none'),

  minPrice: z
    .number()
    .nullable()
    .describe('Minimum price explicitly stated by the user, or null if none'),

  maxPrice: z
    .number()
    .nullable()
    .describe('Maximum price explicitly stated by the user, or null if none'),

  currency: z
    .string()
    .nullable()
    .describe('Currency explicitly stated or unambiguously represented by the user, or null if none'),

  neededBy: z
    .string()
    .nullable()
    .describe('Date or deadline by which the user needs the product, explicitly mentioned, or null if none'),

  sortPreference: z
    .string()
    .nullable()
    .describe('Sorting or price preference explicitly requested by the user, or null if none'),

  preferredColour: z
    .string()
    .nullable()
    .describe('Product colour the user prefers, when expressed as a preference rather than a hard requirement, or null if none'),

  searchTerms: z
    .array(z.string())
    .describe('Useful customer phrases and product terms for catalogue search; return an empty array if none'),
});

export type Intent = z.infer<typeof IntentSchema>;