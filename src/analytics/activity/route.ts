const DYNAMIC_PARENTS = new Set(['product', 'category', 'subcategory', 'order']);
const ID_SEGMENT = /^([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

export function normalizeRoute(path: string): string {
  const clean = path.split(/[?#]/)[0] || '/';
  const segments = clean.split('/');
  const normalized = segments.map((segment, i) =>
    segment && (ID_SEGMENT.test(segment) || DYNAMIC_PARENTS.has(segments[i - 1])) ? ':id' : segment,
  );
  const route = normalized.join('/').replace(/\/+$/, '') || '/';
  return route.slice(0, 200);
}
