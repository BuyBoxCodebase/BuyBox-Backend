/**
 * @deprecated Search tags are no longer read anywhere. Do not build new features on them.
 *
 * Lino's product search (src/lino/search) used to filter on these tags, but now
 * reads the real product data instead, because the tags gave wrong results:
 *
 * - They are per product, not per variant. A search for "white, size 9" matched
 *   a product that only had white in size 8 and black in size 9, and sizes that
 *   were out of stock still matched.
 * - They go stale. They are only rebuilt when a product is created or updated,
 *   so option values added later (addProductOptionValues) never got a tag and
 *   could not be found until sync-search-tags.ts was run by hand.
 * - The tag name is the option name with spaces removed, so an option called
 *   "Shoe Size" produced "shoesize:9", which a "size:9" search never matched.
 *
 * The search now matches brand, category and gender on the product fields, and
 * size, colour, price and stock on each variant's own options and inventory.
 *
 * This is still called on product create and update, so the searchTags field
 * keeps being filled, but nothing uses it. It is kept for now in case the tags
 * are needed again; it can be removed together with the searchTags field,
 * its index, and the sync-search-tags.ts / revert-search-tags.ts scripts.
 */
export function generateSearchTags(data: {
  categoryName?: string;
  subCategoryName?: string;
  options?: { name: string; values: ({ value: string } | string)[] }[];
  brand?: string | null;
  modelName?: string | null;
  gender?: string | null;
}): string[] {
  const tags = new Set<string>();

  const clean = (str: string) => str.toLowerCase().trim();

  if (data.categoryName) {
    tags.add(`category:${clean(data.categoryName)}`);
  }

  if (data.subCategoryName) {
    tags.add(`subcategory:${clean(data.subCategoryName)}`);
  }

  if (data.brand) {
    tags.add(`brand:${clean(data.brand)}`);
  }

  if (data.modelName) {
    tags.add(`model:${clean(data.modelName)}`);
  }

  if (data.gender) {
    tags.add(`gender:${clean(data.gender)}`);
  }

  if (data.options) {
    for (const option of data.options) {
      const optionNameClean = clean(option.name).replace(/\s+/g, '');
      for (const val of option.values) {
        const valueStr = typeof val === 'string' ? val : val.value;
        tags.add(`${optionNameClean}:${clean(valueStr)}`);
      }
    }
  }

  return Array.from(tags);
}
