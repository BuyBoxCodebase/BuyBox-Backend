import { z } from 'zod';

export const IntentSchema = z.object({
  label: z
    .string()
    .nullable()
    .describe('Broad search intent or keyword explicitly mentioned by the user, or null if none'),

  product: z
    .string()
    .nullable()
    .describe('Specific product explicitly mentioned by the user, or null if none'),

  category: z
    .string()
    .nullable()
    .describe('Product category explicitly mentioned or clearly stated by the user, or null if none'),

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

  gender: z
    .string()
    .nullable()
    .describe('Gender explicitly mentioned by the user, or null if none'),

  size: z
    .string()
    .nullable()
    .describe('Size explicitly mentioned by the user, or null if none'),

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

  deliveryDate: z
    .string()
    .nullable()
    .describe('Delivery deadline explicitly requested by the user, or null if none'),

  sortPreference: z
    .string()
    .nullable()
    .describe('Sorting preference explicitly requested by the user, or null if none')
});

export type Intent = z.infer<typeof IntentSchema>;