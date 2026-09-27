export function generateSearchTags(data: {
  brandName?: string;
  categoryName?: string;
  subCategoryName?: string;
  options?: { name: string; values: ({ value: string } | string)[] }[];
  labels?: string[];
}): string[] {
  const tags = new Set<string>();

  const clean = (str: string) => str.toLowerCase().trim();

  if (data.brandName) {
    tags.add(`brand:${clean(data.brandName)}`);
  }

  if (data.categoryName) {
    tags.add(`category:${clean(data.categoryName)}`);
  }

  if (data.subCategoryName) {
    tags.add(`subcategory:${clean(data.subCategoryName)}`);
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

  if (data.labels) {
    for (const label of data.labels) {
      tags.add(`label:${clean(label)}`);
    }
  }

  return Array.from(tags);
}
