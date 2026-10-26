// Reciprocal Rank Fusion: merges several ranked lists into one.
// A product's score is the sum of 1 / (k + rank) over the lists it appears in, so products that rank
// well in both keyword and meaning search come first, and a product found by only one still gets in.
// Only positions matter, never the raw scores, which are not comparable between the two searches.
export const RRF_K = 60;

export function fuseRankings(lists: string[][], k = RRF_K): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
