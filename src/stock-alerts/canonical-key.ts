import { colourWords, normaliseKey, normaliseSize } from '../search/query/normalise';

// Canonical keys: the same shoe gets the same key whichever seller lists it, so a watch-list entry made on one
// seller's sold-out listing matches another seller's listing later. Pure functions, no database.
//
// Deliberately NOT in the key:
//  - gender: customers rarely search with it and sellers label it inconsistently ("male", "all", "unisex").
//  - size system (UK/US/EU): sizes are compared as typed, never converted, so a wrong guess can't send a wrong-size alert.

function slug(value: string | null | undefined): string {
  return (normaliseKey(value) ?? '').replace(/\s+/g, '-');
}

// "Air Force 1" for brand "Nike". A name that repeats the brand ("Nike Air Force 1") gets the same key.
export function nameKey(brand: string | null | undefined, name: string): string {
  const brandSlug = slug(brand);
  const nameSlug = slug(name);
  if (brandSlug && nameSlug.startsWith(`${brandSlug}-`)) return nameSlug.slice(brandSlug.length + 1);
  return nameSlug;
}

export function productKey(brand: string | null | undefined, name: string): string {
  return `${slug(brand) || '_'}:${nameKey(brand, name)}`;
}

// "Triple Black/White" and "white/black" -> "black-white". A colour with no base colour word ("Panda") keeps its own name.
export function colourKey(colour: string | null | undefined): string {
  if (!colour) return 'any';
  const words = [...colourWords(colour)].sort();
  return words.length > 0 ? words.join('-') : slug(colour) || 'any';
}

export function sizeKey(size: string | null | undefined): string {
  return size ? normaliseSize(size) : 'any';
}

export function variantKey(brand: string | null | undefined, name: string, colour: string | null | undefined, size: string | null | undefined): string {
  return `${productKey(brand, name)}|${colourKey(colour)}|${sizeKey(size)}`;
}
