import { z } from 'zod';

export const IntentSchema = z.object({
  label: z
    .string()
    .optional()
    .describe('Broad search intent or keyword explicitly mentioned by the user'),

  product: z
    .string()
    .optional()
    .describe('Specific product explicitly mentioned by the user'),

  category: z
    .string()
    .optional()
    .describe('Product category explicitly mentioned or clearly stated by the user'),

  brand: z
    .string()
    .optional()
    .describe('Brand explicitly mentioned by the user'),

  colour: z
    .string()
    .optional()
    .describe('Color explicitly mentioned by the user'),

  occasion: z
    .string()
    .optional()
    .describe('Occasion explicitly mentioned by the user'),

  gender: z
    .string()
    .optional()
    .describe('Gender explicitly mentioned by the user'),

  size: z
    .string()
    .optional()
    .describe('Size explicitly mentioned by the user'),

  minPrice: z
    .number()
    .optional()
    .describe('Minimum price explicitly stated by the user'),

  maxPrice: z
    .number()
    .optional()
    .describe('Maximum price explicitly stated by the user'),

  currency: z
    .string()
    .optional()
    .describe('Currency explicitly stated or unambiguously represented by the user'),

  deliveryDate: z
    .string()
    .optional()
    .describe('Delivery deadline explicitly requested by the user'),

  sortPreference: z
    .string()
    .optional()
    .describe('Sorting preference explicitly requested by the user')
});