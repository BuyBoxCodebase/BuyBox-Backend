import { Gender } from '../search.types';

// Text helpers shared by the indexer (building documents) and the parser (reading queries),
// so a value is written and looked up the same way.

// Lowercase, accents removed, apostrophes dropped ("men's" -> "mens"), other punctuation turned into spaces.
// ".", "$", "-" and "+" are kept because prices and sizes use them ("$80", "9.5", "50-100", "100+").
export function normaliseText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.$+\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = normaliseText(value).replace(/[.$+-]/g, ' ').replace(/\s+/g, ' ').trim();
  return key || null;
}

// "9", "US 9", "9.0" and "size 9" are the same size. "XL" stays "xl".
export function normaliseSize(size: string): string {
  const text = size.toLowerCase().replace(/\b(us|uk|eu|size)\b/g, '').replace(/\s+/g, '');
  const number = Number(text);
  return Number.isNaN(number) || text === '' ? text : String(number);
}

// Colours customers search by. A variant colour like "Triple Black" or "University Blue"
// is indexed under the base colours it mentions.
export const BASE_COLOURS = [
  'black', 'white', 'grey', 'red', 'blue', 'navy', 'green', 'olive', 'yellow', 'orange', 'pink', 'purple',
  'brown', 'tan', 'beige', 'cream', 'khaki', 'silver', 'gold', 'maroon', 'burgundy', 'teal',
] as const;

const COLOUR_ALIASES: Record<string, string> = { gray: 'grey', multicolor: 'multi', multicolour: 'multi' };

export function canonicalColour(word: string): string | null {
  const key = word.toLowerCase();
  const colour = COLOUR_ALIASES[key] ?? key;
  return (BASE_COLOURS as readonly string[]).includes(colour) ? colour : null;
}

// The base colours a variant colour name mentions, e.g. "Triple Black/White" -> ["black", "white"].
export function colourWords(colourName: string | null): string[] {
  if (!colourName) return [];
  const words = normaliseText(colourName).split(/[\s/-]+/);
  return [...new Set(words.map(canonicalColour).filter(Boolean))];
}

// Products are stored as 'male' | 'female' | 'all' | 'unisex'. Men's and women's searches include unisex products.
export function gendersFor(gender: Gender): string[] {
  return gender === 'unisex' ? ['unisex', 'all'] : [gender, 'unisex', 'all'];
}
