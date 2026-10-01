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
