// Reads size and colour off a variant's option values.

export function findOptionValue(
  row: { options: { optionValue: { value: string; option: { name: string } } }[] },
  isWantedOption: (optionName: string) => boolean,
): string | null {
  const match = row.options.find((link) => isWantedOption(link.optionValue.option.name));
  return match?.optionValue.value ?? null;
}

// "Size", "Shoe Size" and "US Size" all count as size.
export function isSizeOption(optionName: string): boolean {
  return optionName.toLowerCase().includes('size');
}

// "Colour" and "Color" both count as colour.
export function isColourOption(optionName: string): boolean {
  const name = optionName.toLowerCase();
  return name.includes('colour') || name.includes('color');
}
