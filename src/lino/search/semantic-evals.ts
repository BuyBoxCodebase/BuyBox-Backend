import { SearchFilters } from './search.types';
import { extractSemanticIntent } from './semantic-intent';

export interface SemanticEvalCase {
  name: string;
  query: string;
  expected: Partial<SearchFilters>;
}

export const SEMANTIC_EVALS: SemanticEvalCase[] = [
  {
    name: 'plantar fasciitis comfort',
    query: 'good shoes for plantar fasciitis with heel pain',
    expected: {
      category: 'Running',
      occasion: 'comfort',
      keywords: ['plantar', 'heel pain'],
    },
  },
  {
    name: 'marathon running',
    query: 'need daily marathon shoes',
    expected: {
      category: 'Running',
      occasion: 'running',
    },
  },
  {
    name: 'gym and crossfit',
    query: 'best crossfit shoes right now',
    expected: {
      category: 'Training',
      occasion: 'training',
    },
  },
  {
    name: 'trail conditions',
    query: 'waterproof trail runners',
    expected: {
      category: 'Running',
      occasion: 'trail',
    },
  },
  {
    name: 'brand and price',
    query: 'white new balance under 100',
    expected: {
      brand: 'New Balance',
      colour: 'white',
      maxPrice: 100,
    },
  },
];

export function runSemanticEvalSuite(): Array<{ name: string; passed: boolean; actual: Partial<SearchFilters>; expected: Partial<SearchFilters> }> {
  return SEMANTIC_EVALS.map((example) => {
    const actual = extractSemanticIntent(example.query);
    const expectedKeys = Object.keys(example.expected);
    const passed = expectedKeys.every((key) => {
      const expectedValue = example.expected[key as keyof SearchFilters];
      const actualValue = actual[key as keyof SearchFilters];
      if (Array.isArray(expectedValue) && Array.isArray(actualValue)) {
        return expectedValue.every((part) => actualValue.includes(part));
      }
      return actualValue === expectedValue;
    });

    return { name: example.name, passed, actual, expected: example.expected };
  });
}
