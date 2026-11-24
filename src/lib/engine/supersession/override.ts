/**
 * engine/supersession/override.ts - "this source wins over those, by name".
 *
 * INTENT
 *   A dependency (`_meta.dependencies`) drags a whole brew onto the site, so
 *   the same spell can show up three times from three books. An override rule
 *   says which book wins for one content type: every same-named entity in the
 *   chosen target sources redirects to the winner's copy. Pure; no I/O.
 *
 * A RULE IS AUTHORING STATE, NOT RUNTIME STATE
 *   The rule is stored in the file but `Renderer.supersede` never reads it.
 *   The server expands it into ordinary rows on save, each tagged `override`
 *   with the rule id, so the runtime redirects them like any other and only
 *   its filter has to tell the two kinds apart. Matching needs the whole
 *   corpus, which the browser never has.
 */
import type { SupersessionRow } from './types.ts';
import { rowKey } from './document.ts';
import { packUid } from './hash.ts';
import { propToPage } from './prop-page.ts';
import type { OverrideRule } from './override-parse.ts';

export { overrideId, parseOverrideRules } from './override-parse.ts';
export type { OverrideRule } from './override-parse.ts';

/** An entity as the content index holds it. */
export interface OverrideEntity {
  prop: string;
  source: string;
  hash: string;
  name: string;
}

/** One entity a rule would redirect, and where to. */
export interface OverrideMatch {
  name: string;
  source: string;
  prop: string;
  page: string;
  hash: string;
  /** `rowKey` of the row this would become - what `exclude` stores. */
  key: string;
  /** `Name|Source` of the winning entity. */
  replacementUid: string;
}

/** Every match inside one other source. */
export interface OverrideTarget {
  source: string;
  matches: OverrideMatch[];
}

/**
 * A rule as the pages hold it. `keys` are the `page|hash` originals it
 * redirects - from the saved file, or from the matches the override page
 * picked when the rule is new - so the picker can mark them taken.
 */
export type LoadedOverride = OverrideRule & {
  rowCount: number;
  keys: string[];
  missing: boolean;
};

export const isOverrideRow = (row: SupersessionRow): boolean =>
  typeof row.extra?.override === 'string';

/**
 * Same-named entities of `prop` outside `from`, grouped by source. Exact
 * names only, ignoring case: "Fireball (2024)" is a different spell as far as
 * this knows, and guessing would redirect things nobody asked to redirect.
 */
export function findOverrideMatches(
  prop: string,
  from: string,
  fromEntities: OverrideEntity[],
  others: OverrideEntity[],
): OverrideTarget[] {
  const page = propToPage(prop);
  if (!page) return [];
  const fromKey = from.toLowerCase();
  const winners = new Map<string, OverrideEntity>();
  for (const e of fromEntities) {
    if (e.prop !== prop) continue;
    const name = e.name.toLowerCase();
    if (!winners.has(name)) winners.set(name, e);
  }

  const bySource = new Map<string, OverrideMatch[]>();
  for (const e of others) {
    if (e.prop !== prop || e.source.toLowerCase() === fromKey) continue;
    const winner = winners.get(e.name.toLowerCase());
    if (!winner) continue;
    const match: OverrideMatch = {
      name: e.name,
      source: e.source,
      prop,
      page,
      hash: e.hash,
      key: rowKey({ page, hash: e.hash }),
      replacementUid: packUid(winner.name, winner.source),
    };
    const list = bySource.get(e.source);
    if (list) list.push(match);
    else bySource.set(e.source, [match]);
  }

  return [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, matches]) => ({
      source,
      matches: matches.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/**
 * The rows a rule produces. `handKeys` are originals a hand-written row
 * already maps; those win, because someone chose them one at a time.
 */
export function expandOverride(
  rule: OverrideRule,
  targets: OverrideTarget[],
  handKeys: Set<string>,
): SupersessionRow[] {
  const chosen = new Set(rule.targets.map((s) => s.toLowerCase()));
  const excluded = new Set(rule.exclude);
  const rows: SupersessionRow[] = [];
  for (const target of targets) {
    if (!chosen.has(target.source.toLowerCase())) continue;
    for (const m of target.matches) {
      if (excluded.has(m.key) || handKeys.has(m.key)) continue;
      rows.push({
        displayName: m.name,
        source: m.source,
        page: m.page,
        hash: m.hash,
        prop: m.prop,
        replacedBy: [{ page: m.page, prop: m.prop, uid: m.replacementUid }],
        extra: { override: rule.id },
      });
    }
  }
  return rows;
}

/**
 * Rules that override each other. The runtime drops both sides of a cycle,
 * so the user needs to hear about it before Deploy, not from a console.
 */
export function overrideConflicts(rules: OverrideRule[]): string[] {
  const out = new Set<string>();
  const hits = (rule: OverrideRule, source: string): boolean =>
    rule.targets.some((t) => t.toLowerCase() === source.toLowerCase());
  for (const a of rules) {
    for (const b of rules) {
      if (a === b || a.prop !== b.prop) continue;
      if (hits(a, b.from) && hits(b, a.from)) out.add(a.id);
    }
  }
  return [...out];
}

/**
 * The rows a save writes: every hand row as-is, plus each rule freshly
 * expanded against `targetsByRule` (rule id -> its matches in the current
 * corpus). Rule rows coming IN are discarded - they're whatever the last save
 * produced, and the corpus may have moved since.
 */
export function applyOverrides(
  rows: SupersessionRow[],
  rules: OverrideRule[],
  targetsByRule: Map<string, OverrideTarget[]>,
): { rows: SupersessionRow[]; warnings: string[] } {
  const handRows = rows.filter((r) => !isOverrideRow(r));
  const handKeys = new Set(handRows.map(rowKey));
  const out = [...handRows];
  const warnings: string[] = [];
  for (const rule of rules) {
    const targets = targetsByRule.get(rule.id) ?? [];
    if (!targets.length) {
      warnings.push(
        `${rule.from} has no ${rule.prop} sharing a name with another source - is the brew still loaded?`,
      );
      continue;
    }
    out.push(...expandOverride(rule, targets, handKeys));
  }
  for (const id of overrideConflicts(rules)) {
    warnings.push(
      `${id} and another rule override each other; the site ignores both.`,
    );
  }
  return { rows: out, warnings };
}
