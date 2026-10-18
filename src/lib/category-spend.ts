/** One line of "spend by category": a category (or the leftovers) with its share of the total. */
export interface CategorySlice {
  name: string;
  amountSatang: number;
  /** Whole percent; the slices of one list add up to exactly 100. */
  percent: number;
  /** `categories.icon` of the category (an emoji is shown in front of the name). */
  icon?: string | null;
  /** True for the "อื่นๆ (n หมวด)" line that gathers the smallest categories. */
  other?: boolean;
}

export const MAX_SLICES = 8;

/**
 * Whole percents of `amounts` that add up to exactly 100 (largest remainder), so a card never
 * shows 99% or 101% in total. All zero when the total is zero.
 */
export function wholePercents(amounts: number[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((a) => (a * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const byRemainder = exact
    .map((x, i) => ({ i, rest: x - Math.floor(x) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    floors[i] = (floors[i] ?? 0) + 1;
    left -= 1;
  }
  return floors;
}

/**
 * The biggest `max` categories, largest first, then one line for the rest. Rows that spent nothing
 * are dropped.
 */
export function buildCategorySlices(
  rows: { name: string; amountSatang: number; icon?: string | null }[],
  max = MAX_SLICES,
): CategorySlice[] {
  const sorted = rows
    .filter((r) => r.amountSatang > 0)
    .sort((a, b) => b.amountSatang - a.amountSatang);
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max);
  const entries: { name: string; amountSatang: number; icon?: string | null; other?: boolean }[] = [
    ...head,
  ];
  if (rest.length > 0) {
    entries.push({
      name: `อื่นๆ (${rest.length} หมวด)`,
      amountSatang: rest.reduce((s, r) => s + r.amountSatang, 0),
      other: true,
    });
  }
  const percents = wholePercents(entries.map((e) => e.amountSatang));
  return entries.map((e, i) => ({ ...e, percent: percents[i] ?? 0 }));
}
