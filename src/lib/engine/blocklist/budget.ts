/**
 * engine/blocklist/budget.ts — how many rows each source may draw.
 *
 * WHY
 *   The category filter opens one content type in every source at once.
 *   "Creatures" is 156 sources and 11,499 entries in this corpus; drawing that
 *   in one pass makes the page crawl, and every later tick re-costs it.
 *
 *   So the view gets a row budget, spent in display order, and a Load more
 *   button raises it. Capping per-source instead wouldn't work: nearly every
 *   source holds well under any sane per-source cap, so the total would still
 *   land near eleven thousand.
 *
 *   Order matters — the budget follows whatever sort the list is under, so
 *   "first 2,000 rows" always means the first 2,000 you'd actually scroll to.
 */

export interface BudgetGroup {
  key: string;
  /** Rows this group WOULD draw, after filtering. */
  size: number;
}

export interface BudgetResult {
  /** key → rows that group may draw. Every input key is present. */
  taken: Map<string, number>;
  shown: number;
  /** Full row count ignoring the budget — what Load more is counting down. */
  total: number;
  truncated: boolean;
}

export function allocateRowBudget(
  groups: BudgetGroup[],
  budget: number,
): BudgetResult {
  const taken = new Map<string, number>();
  let left = Math.max(0, budget);
  let shown = 0;
  let total = 0;

  for (const g of groups) {
    const size = Math.max(0, g.size);
    total += size;
    const take = Math.min(size, left);
    taken.set(g.key, take);
    left -= take;
    shown += take;
  }

  return { taken, shown, total, truncated: shown < total };
}
