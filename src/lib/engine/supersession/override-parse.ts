/**
 * engine/supersession/override-parse.ts - the stored shape of an override rule.
 *
 * Split from `override.ts` so `document.ts` can read rules without importing
 * a module that itself imports `document.ts`. Pure; no I/O.
 */

/** "For `prop`, `from` wins over same-named entities in `targets`." */
export interface OverrideRule {
  /** `prop:from` - one rule per source and type. */
  id: string;
  prop: string;
  /** Entity source code of the winner, as the content index carries it. */
  from: string;
  /** Entity source codes whose same-named entities are redirected. */
  targets: string[];
  /** `page|hash` of originals unchecked inside a selected target. */
  exclude: string[];
}

export const overrideId = (prop: string, from: string): string =>
  `${prop}:${from}`;

const strings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((s): s is string => typeof s === 'string' && !!s)
    : [];

/**
 * Read the file's `overrides` array. Tolerant like the row parser, and the id
 * is always rebuilt from `prop` + `from` - a hand-edited id that disagrees
 * would orphan every row the rule made.
 */
export function parseOverrideRules(raw: unknown): OverrideRule[] {
  if (!Array.isArray(raw)) return [];
  const out: OverrideRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.prop !== 'string' || !r.prop) continue;
    if (typeof r.from !== 'string' || !r.from) continue;
    out.push({
      id: overrideId(r.prop, r.from),
      prop: r.prop,
      from: r.from,
      targets: strings(r.targets),
      exclude: strings(r.exclude),
    });
  }
  return out;
}
