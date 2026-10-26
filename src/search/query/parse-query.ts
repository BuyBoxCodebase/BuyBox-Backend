import { Gender, ParsedQuery, SearchFilters, SortOption } from '../search.types';
import { canonicalColour, normaliseSize, normaliseText } from './normalise';

// Turns search-box text into hard filters plus the remaining free text.
// Brands and categories are matched against the real catalog values (the vocabulary), whole words only,
// so "cushioned" never matches the brand "On" and "hundred" never matches "red".

export interface VocabularyEntry {
  key: string; // normalised, e.g. "new balance"
  label: string; // as stored, e.g. "New Balance"
}

export interface Vocabulary {
  brands: VocabularyEntry[];
  categories: VocabularyEntry[];
}

// Words that carry no meaning for search.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with', 'without', 'at', 'by', 'from', 'that', 'this',
  'these', 'those', 'is', 'are', 'be', 'it', 'its', 'my', 'me', 'i', 'im', 'we', 'you', 'your', 'some', 'any', 'can',
  'do', 'does', 'have', 'has', 'got', 'get', 'very', 'really', 'so', 'too', 'also', 'just', 'like', 'please', 'pls',
]);

// Request phrasing, dropped from the text entirely.
const FILLER = new Set([
  'show', 'find', 'search', 'looking', 'look', 'want', 'wanna', 'need', 'give', 'recommend', 'suggest', 'buy',
  'something', 'anything', 'stuff', 'hey', 'hi', 'hello',
]);

// Words that describe nearly every product. Kept for meaning search, ignored for keyword search.
const GENERIC = new Set(['shoe', 'shoes', 'footwear', 'pair', 'pairs', 'product', 'products', 'item', 'items']);

const GENDER_WORDS: Record<string, Gender> = {
  men: 'male', mens: 'male', man: 'male', male: 'male', guys: 'male', guy: 'male', boys: 'male', gents: 'male',
  women: 'female', womens: 'female', woman: 'female', female: 'female', ladies: 'female', lady: 'female', girls: 'female',
  unisex: 'unisex',
};

const SORT_PHRASES: Record<string, SortOption> = {
  cheapest: 'price_low_to_high',
  cheap: 'price_low_to_high',
  budget: 'price_low_to_high',
  affordable: 'price_low_to_high',
  'most expensive': 'price_high_to_low',
  priciest: 'price_high_to_low',
  premium: 'price_high_to_low',
  newest: 'newest',
  latest: 'newest',
  'new arrivals': 'newest',
  'just dropped': 'newest',
};

const NUMBER = String.raw`\$?\s?(\d+(?:\.\d+)?)(?:\s?(?:usd|dollars?|bucks|\$))?`;
const PRICE_PATTERNS: { pattern: RegExp; apply: (match: RegExpMatchArray, filters: SearchFilters) => void }[] = [
  {
    pattern: new RegExp(String.raw`\b(?:between|from)\s${NUMBER}\s(?:and|to|-)\s${NUMBER}`),
    apply: (m, f) => setRange(f, Number(m[1]), Number(m[2])),
  },
  {
    pattern: /\$\s?(\d+(?:\.\d+)?)\s?(?:-|to)\s?\$?\s?(\d+(?:\.\d+)?)/,
    apply: (m, f) => setRange(f, Number(m[1]), Number(m[2])),
  },
  {
    pattern: new RegExp(
      // No bare "max" here: "air max 90" is a product name, not a price.
      String.raw`\b(?:under|below|less than|cheaper than|up to|upto|within|at most|no more than)\s${NUMBER}`,
    ),
    apply: (m, f) => (f.maxPrice = Number(m[1])),
  },
  {
    pattern: new RegExp(String.raw`${NUMBER}\s(?:or less|or under|or below)\b`),
    apply: (m, f) => (f.maxPrice = Number(m[1])),
  },
  {
    pattern: new RegExp(String.raw`\b(?:over|above|more than|at least|starting at|from)\s${NUMBER}`),
    apply: (m, f) => (f.minPrice = Number(m[1])),
  },
  {
    pattern: new RegExp(String.raw`${NUMBER}\s?(?:\+|or more|and up|and above)`),
    apply: (m, f) => (f.minPrice = Number(m[1])),
  },
];

const SIZE_PATTERN = /\b(?:size|sz|us|uk|eu)\s?:?\s?(\d{1,2}(?:\.5)?|xxs|xs|s|m|l|xl|xxl|xxxl)(?![\w.])/;

export function parseQuery(query: string, vocabulary: Vocabulary): ParsedQuery {
  const filters: SearchFilters = {};
  let text = ` ${normaliseText(query)} `;

  text = extractPrice(text, filters);
  text = extractSize(text, filters);

  const tokens = text.split(' ').map(cleanToken).filter(Boolean);
  const used = tokens.map(() => false);

  matchPhrases(tokens, used, brandLookup(vocabulary.brands), (label) => (filters.brand = label));
  matchPhrases(tokens, used, categoryLookup(vocabulary.categories), (label) => (filters.category = label));

  let sort: SortOption | undefined;
  matchPhrases(tokens, used, new Map(Object.entries(SORT_PHRASES)), (value) => (sort = value as SortOption));

  tokens.forEach((token, i) => {
    if (used[i]) return;
    const colour = canonicalColour(token);
    if (colour && !filters.colour) {
      filters.colour = colour;
      used[i] = true;
      return;
    }
    const gender = GENDER_WORDS[token];
    if (gender && !filters.gender) {
      filters.gender = gender;
      used[i] = true;
    }
  });

  const remaining = tokens.filter((token, i) => !used[i] && !FILLER.has(token));
  const keywordTokens = remaining.filter((token) => !STOPWORDS.has(token) && !GENERIC.has(token));

  // Nothing left but glue and generic words ("show me some black shoes"): only filters, no free text.
  if (keywordTokens.length === 0) {
    return { text: '', keywordText: '', filters, sort };
  }

  return {
    text: remaining.join(' '),
    keywordText: keywordTokens.join(' '),
    filters,
    sort,
  };
}

// The words of a free-text need that are worth matching by keyword
// ("cushioned shoes for standing all day" -> "cushioned standing all day").
export function toKeywordText(text: string): string {
  return normaliseText(text)
    .split(' ')
    .map(cleanToken)
    .filter((token) => token && !STOPWORDS.has(token) && !FILLER.has(token) && !GENERIC.has(token))
    .join(' ');
}

function extractPrice(text: string, filters: SearchFilters): string {
  for (const { pattern, apply } of PRICE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    apply(match, filters);
    text = text.replace(match[0], ' ');
  }
  return text;
}

function extractSize(text: string, filters: SearchFilters): string {
  const match = text.match(SIZE_PATTERN);
  if (!match) return text;
  filters.size = normaliseSize(match[1]);
  return text.replace(match[0], ' ');
}

function setRange(filters: SearchFilters, a: number, b: number) {
  filters.minPrice = Math.min(a, b);
  filters.maxPrice = Math.max(a, b);
}

function cleanToken(token: string): string {
  return token.replace(/^[.$+-]+|[.$+-]+$/g, '');
}

// Marks the longest matching phrase first, so "new balance" wins over "new".
// Only the first match is used; later ones stay in the free text.
function matchPhrases(
  tokens: string[],
  used: boolean[],
  lookup: Map<string, string>,
  onMatch: (label: string) => void,
) {
  if (lookup.size === 0) return;
  const longest = Math.max(...[...lookup.keys()].map((key) => key.split(' ').length));

  for (let size = Math.min(longest, tokens.length); size >= 1; size--) {
    for (let start = 0; start + size <= tokens.length; start++) {
      if (used.slice(start, start + size).some(Boolean)) continue;
      const label = lookup.get(tokens.slice(start, start + size).join(' '));
      if (label === undefined) continue;

      onMatch(label);
      used.fill(true, start, start + size);
      return;
    }
  }
}

// Brands whose name is also an everyday word ("On") are left to keyword search,
// otherwise "shoes on sale" would become a brand filter.
function brandLookup(brands: VocabularyEntry[]): Map<string, string> {
  return new Map(
    brands.filter(({ key }) => !STOPWORDS.has(key) && !FILLER.has(key)).map(({ key, label }) => [key, label]),
  );
}

// "sneaker" and "sneakers" both match a "Sneakers" category.
function categoryLookup(categories: VocabularyEntry[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const { key, label } of categories) {
    if (GENERIC.has(key)) continue; // a "Shoes" category would otherwise filter every query mentioning shoes
    lookup.set(key, label);
    if (key.endsWith('s') && key.length > 3) lookup.set(key.slice(0, -1), label);
    else lookup.set(`${key}s`, label);
  }
  return lookup;
}
