import { FilterName, SearchAttempt, SearchFilters } from './search.types';

const PRICE_WIDEN_RATE = 0.2;

// Filters are dropped one by one, in this order, until something is found.
// Brand is never dropped. Occasion is not here because it only affects ranking, never filtering.
type LooseningStep =
  | { kind: 'drop'; filter: FilterName }
  | { kind: 'widenPrice' }
  | { kind: 'dropPrice' };

const LOOSENING_STEPS: LooseningStep[] = [
  { kind: 'drop', filter: 'colour' },
  { kind: 'drop', filter: 'size' },
  { kind: 'widenPrice' },
  { kind: 'dropPrice' },
  { kind: 'drop', filter: 'gender' },
  { kind: 'drop', filter: 'category' },
  { kind: 'drop', filter: 'productName' },
];

// Returns the exact search first, then each looser version that actually changes something.
export function buildSearchAttempts(filters: SearchFilters): SearchAttempt[] {
  const attempts: SearchAttempt[] = [{ filters, droppedFilters: [], widenedPrice: false }];

  for (const step of LOOSENING_STEPS) {
    const previous = attempts[attempts.length - 1];
    const next = applyStep(previous, step);
    if (next) attempts.push(next);
  }

  return attempts;
}

// Returns null when the step has nothing to loosen.
function applyStep(attempt: SearchAttempt, step: LooseningStep): SearchAttempt | null {
  switch (step.kind) {
    case 'drop':
      return dropFilter(attempt, step.filter);
    case 'widenPrice':
      return widenPrice(attempt);
    case 'dropPrice':
      return dropPrice(attempt);
  }
}

function dropFilter(attempt: SearchAttempt, filter: FilterName): SearchAttempt | null {
  if (attempt.filters[filter] === undefined) return null;

  const filters = { ...attempt.filters };
  delete filters[filter];
  return { ...attempt, filters, droppedFilters: [...attempt.droppedFilters, filter] };
}

function widenPrice(attempt: SearchAttempt): SearchAttempt | null {
  const { minPrice, maxPrice } = attempt.filters;
  if (minPrice === undefined && maxPrice === undefined) return null;

  const filters = { ...attempt.filters };
  if (minPrice !== undefined) filters.minPrice = roundPrice(minPrice * (1 - PRICE_WIDEN_RATE));
  if (maxPrice !== undefined) filters.maxPrice = roundPrice(maxPrice * (1 + PRICE_WIDEN_RATE));
  return { ...attempt, filters, widenedPrice: true };
}

function dropPrice(attempt: SearchAttempt): SearchAttempt | null {
  const { minPrice, maxPrice } = attempt.filters;
  if (minPrice === undefined && maxPrice === undefined) return null;

  const filters = { ...attempt.filters };
  delete filters.minPrice;
  delete filters.maxPrice;

  const dropped: FilterName[] = [];
  if (minPrice !== undefined) dropped.push('minPrice');
  if (maxPrice !== undefined) dropped.push('maxPrice');

  return { filters, droppedFilters: [...attempt.droppedFilters, ...dropped], widenedPrice: false };
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
