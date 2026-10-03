import { SearchFilters } from './search.types';
import { SNEAKER_BIOMECHANICAL_DICTIONARY } from './biomechanical-dictionary';

const COLOR_MAP: Record<string, string> = {
  black: 'black',
  white: 'white',
  red: 'red',
  blue: 'blue',
  green: 'green',
  yellow: 'yellow',
  silver: 'silver',
  gold: 'gold',
  beige: 'beige',
  brown: 'brown',
  grey: 'grey',
  gray: 'grey',
  navy: 'navy',
  pink: 'pink',
  orange: 'orange',
  purple: 'purple',
};

const CATEGORY_MAP: Record<string, string> = {
  'running shoes': 'Running',
  running: 'Running',
  sneakers: 'Sneakers',
  training: 'Training',
  basketball: 'Basketball',
  lifestyle: 'Lifestyle',
  trail: 'Running',
  'off road': 'Running',
};

const BRAND_PATTERNS: Record<string, string> = {
  nike: 'Nike',
  adidas: 'Adidas',
  asics: 'Asics',
  hoka: 'Hoka',
  'new balance': 'New Balance',
  brooks: 'Brooks',
  puma: 'Puma',
  reebok: 'Reebok',
  converse: 'Converse',
  vans: 'Vans',
  salomon: 'Salomon',
  'under armour': 'Under Armour',
  on: 'On',
  saucony: 'Saucony',
  mizuno: 'Mizuno',
  timberland: 'Timberland',
};

export interface SemanticContext {
  query: string;
  normalized: string;
  intent: SearchFilters;
  prompt: string;
}

export function extractSemanticIntent(query: string, previousIntent: Partial<SearchFilters> = {}): SearchFilters {
  const text = normalizeQuery(query);
  const intent: SearchFilters = { ...previousIntent };

  const category = findCategory(text);
  if (category) intent.category = category;

  const colour = findColour(text);
  if (colour) intent.colour = colour;

  const brand = findBrand(text);
  if (brand) intent.brand = brand;

  const occasion = findOccasion(text);
  if (occasion) intent.occasion = occasion;

  const price = findPrice(text);
  if (price) {
    if (price.type === 'min') intent.minPrice = price.value;
    if (price.type === 'max') intent.maxPrice = price.value;
  }

  const biomechanical = matchBiomechanicalSignals(text);
  if (biomechanical.category) intent.category = biomechanical.category;
  if (biomechanical.occasion) intent.occasion = biomechanical.occasion;
  if (biomechanical.keywords?.length) intent.keywords = [...new Set([...(intent.keywords ?? []), ...biomechanical.keywords])];
  if (biomechanical.cushionLevel) intent.cushionLevel = biomechanical.cushionLevel;
  if (biomechanical.supportType) intent.supportType = biomechanical.supportType;
  if (biomechanical.soleType) intent.soleType = biomechanical.soleType;
  if (biomechanical.heelToToeDrop) intent.heelToToeDrop = biomechanical.heelToToeDrop;
  if (biomechanical.upperMaterial) intent.upperMaterial = biomechanical.upperMaterial;

  return intent;
}

export function buildSemanticContext(query: string, previousIntent?: Partial<SearchFilters>): SemanticContext {
  const intent = extractSemanticIntent(query, previousIntent ?? {});
  const lines = Object.entries(intent)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(', ') : value}`);

  return {
    query,
    normalized: normalizeQuery(query),
    intent,
    prompt: ['SEMANTIC INTENT', `query: ${query}`, ...lines].join('\n'),
  };
}

export function evaluateSemanticIntent(query: string, intent: Partial<SearchFilters>): {
  confidence: number;
  coverage: number;
  reasons: string[];
} {
  const normalized = normalizeQuery(query);
  const keys = Object.keys(intent);
  const matched = new Set<string>();

  if (intent.category) matched.add('category');
  if (intent.brand) matched.add('brand');
  if (intent.colour) matched.add('colour');
  if (intent.occasion) matched.add('occasion');
  if (intent.minPrice !== undefined || intent.maxPrice !== undefined) matched.add('price');
  if (intent.keywords?.length) matched.add('keywords');

  const coverage = Math.min(1, matched.size / 6);
  let confidence = coverage;

  if (/\b(plantar|fasciitis|heel pain|knee pain|bad knees|marathon|crossfit|wedding|standing all day|trail)\b/.test(normalized)) {
    confidence += 0.2;
  }

  if (keys.length === 0) {
    confidence = 0.1;
    return {
      confidence: 0.1,
      coverage: 0,
      reasons: ['No semantic signals were detected in the query.'],
    };
  }

  confidence = Math.min(1, confidence + (normalized.split(' ').length > 5 ? 0.1 : 0));
  const reasons = [
    matched.size > 0 ? `Detected ${matched.size} strong shopping signals.` : 'The query is under-specified.',
  ];

  if (intent.brand) reasons.push(`Brand intent: ${intent.brand}`);
  if (intent.category) reasons.push(`Category intent: ${intent.category}`);
  if (intent.occasion) reasons.push(`Use-case intent: ${intent.occasion}`);

  return {
    confidence: Number(confidence.toFixed(2)),
    coverage: Number(coverage.toFixed(2)),
    reasons,
  };
}

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findCategory(value: string): string | undefined {
  for (const [pattern, category] of Object.entries(CATEGORY_MAP)) {
    if (value.includes(pattern)) return category;
  }
  return undefined;
}

function findColour(value: string): string | undefined {
  for (const [token, colour] of Object.entries(COLOR_MAP)) {
    if (value.includes(token)) return colour;
  }
  return undefined;
}

function findBrand(value: string): string | undefined {
  for (const [brand, canonical] of Object.entries(BRAND_PATTERNS)) {
    if (value.includes(brand)) return canonical;
  }
  return undefined;
}

function findOccasion(value: string): string | undefined {
  const occasionPatterns: Record<string, string> = {
    wedding: 'wedding',
    party: 'party',
    gym: 'gym',
    running: 'running',
    work: 'work',
    casual: 'casual',
    travel: 'travel',
    office: 'office',
    training: 'training',
    trail: 'trail',
    hiking: 'hiking',
    standing: 'standing all day',
  };

  for (const [pattern, occasion] of Object.entries(occasionPatterns)) {
    if (value.includes(pattern)) return occasion;
  }
  return undefined;
}

function findPrice(value: string): { type: 'min' | 'max'; value: number } | undefined {
  const minMatch = value.match(/(?:above|over|more than|\>)\s*\$?(\d+)/i);
  if (minMatch) return { type: 'min', value: Number(minMatch[1]) };

  const maxMatch = value.match(/(?:under|below|up to|less than|\<)\s*\$?(\d+)/i);
  if (maxMatch) return { type: 'max', value: Number(maxMatch[1]) };

  return undefined;
}

function matchBiomechanicalSignals(value: string) {
  const matchedKeywords: string[] = [];
  let category: string | undefined;
  let occasion: string | undefined;
  let cushionLevel: SearchFilters['cushionLevel'];
  let supportType: SearchFilters['supportType'];
  let soleType: SearchFilters['soleType'];
  let heelToToeDrop: SearchFilters['heelToToeDrop'];
  let upperMaterial: SearchFilters['upperMaterial'];

  for (const [key, mapping] of Object.entries(SNEAKER_BIOMECHANICAL_DICTIONARY)) {
    const matched = mapping.searchTokens.some((token) => value.includes(token));
    if (!matched) continue;

    const filters = mapping.impliedDatabaseFilters;
    if (filters.category) category = categoryMapping(filters.category);
    if (filters.cushionLevel) cushionLevel = filters.cushionLevel;
    if (filters.supportType) supportType = filters.supportType;
    if (filters.soleType) soleType = filters.soleType;
    if (filters.heelToToeDrop) heelToToeDrop = filters.heelToToeDrop;
    if (filters.upperMaterial) upperMaterial = filters.upperMaterial;

    if (key === 'PLANTAR_FASCIITIS' || key === 'BAD_KNEES' || key === 'ALL_DAY_STANDING') {
      occasion ??= 'comfort';
    }
    if (key === 'MARATHON_RACING' || key === 'DAILY_MILEAGE') {
      occasion ??= 'running';
    }
    if (key === 'CROSSFIT_FUNCTIONAL' || key === 'HEAVY_LIFTING') {
      occasion ??= 'training';
    }
    if (key === 'TRAIL_OR_MUD') {
      occasion ??= 'trail';
    }

    if (mapping.searchTokens.length > 0) matchedKeywords.push(...mapping.searchTokens.filter((token) => value.includes(token)));
  }

  return {
    category,
    occasion,
    keywords: matchedKeywords.slice(0, 6),
    cushionLevel,
    supportType,
    soleType,
    heelToToeDrop,
    upperMaterial,
  };
}

function categoryMapping(value: string): string {
  const map: Record<string, string> = {
    running: 'Running',
    training: 'Training',
    basketball: 'Basketball',
    lifestyle: 'Lifestyle',
    outdoor: 'Running',
  };
  return map[value] ?? value;
}
