import { CandidateProduct } from './search.types';

// Uses the product description to rank better fits higher. Keywords never remove products.

const PHRASE_POINTS = 2; // "wide fit" appears as written
const ALL_WORDS_POINTS = 1; // "wide" and "fit" both appear, but apart

export function keywordScore(product: CandidateProduct, keywords: string[] = []): number {
  const text = normalise(`${product.name} ${product.description}`);
  const words = new Set(text.split(' '));
  return keywords.reduce((score, keyword) => score + scoreKeyword(text, words, keyword), 0);
}

function scoreKeyword(text: string, words: Set<string>, keyword: string): number {
  const phrase = normalise(keyword);
  if (!phrase) return 0;
  if (text.includes(phrase)) return PHRASE_POINTS;
  return phrase.split(' ').every((word) => words.has(word)) ? ALL_WORDS_POINTS : 0;
}

// Lowercase, punctuation turned into spaces, single spaces. "Water-proof!" -> "water proof"
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
