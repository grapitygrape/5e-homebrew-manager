import { entryKey, propLabel } from '$lib/engine/blocklist';
import type {
  BlocklistEntry,
  CascadeMode,
  IndexedEntity,
} from '$lib/engine/blocklist';
import type { RowTone, SourceSummary } from '$lib/components/source-browser.ts';
import type { BannerState, BannerTone } from '$lib/ui/Banner.svelte';

export type BlocklistBannerTone = BannerTone;

export interface BlocklistBannerState extends BannerState {
  /** Optional one-click remedy for whatever the banner is reporting. */
  action?: { label: string; run: () => void };
}

export interface CascadePrompt {
  mode: CascadeMode;
  parentLabel: string;
  children: IndexedEntity[];
}

/** 'all' carries the change to the children; 'parent' changes only the parent. */
export type CascadeChoice = 'all' | 'parent' | 'cancel';

export type ConfirmCascade = (prompt: CascadePrompt) => Promise<CascadeChoice>;

/**
 * 'exact'   - a rule for exactly this
 * 'covered' - a broader rule already blocks it (can't be toggled)
 * 'partial' - not blocked itself, but something inside it is
 * 'none'
 */
export type NodeState = 'exact' | 'covered' | 'partial' | 'none';

export const keyFor = (hash: string, category: string, source: string): string =>
  `${hash.toLowerCase()}__${category.toLowerCase()}__${source.toLowerCase()}`;

/**
 * 'exact'   - this precise rule is in the list
 * 'covered' - a broader rule already blocks it
 * 'none'    - not blocked
 */
export function coverage(
  ruleKeys: Set<string>,
  hash: string,
  category: string,
  source: string,
): 'exact' | 'covered' | 'none' {
  if (ruleKeys.has(keyFor(hash, category, source))) return 'exact';
  if (hash !== '*' || category !== '*') {
    if (ruleKeys.has(keyFor('*', '*', source))) return 'covered';
  }
  if (hash !== '*' && ruleKeys.has(keyFor('*', category, source)))
    return 'covered';
  return 'none';
}

export function buildChildRules(entries: BlocklistEntry[]) {
  const specific = new Map<string, Map<string, number>>();
  const wholeType = new Map<string, Set<string>>();
  for (const e of entries) {
    const src = e.source.toLowerCase();
    if (e.hash === '*') {
      if (e.category === '*') continue;
      const set = wholeType.get(src) ?? new Set<string>();
      set.add(e.category);
      wholeType.set(src, set);
      continue;
    }
    const byCat = specific.get(src) ?? new Map<string, number>();
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
    specific.set(src, byCat);
  }
  return { specific, wholeType };
}

export function blockedChildren(
  childRules: ReturnType<typeof buildChildRules>,
  source: string,
  prop: string,
): number {
  return childRules.specific.get(source.toLowerCase())?.get(prop) ?? 0;
}

export function blockedUnder(
  childRules: ReturnType<typeof buildChildRules>,
  source: string,
): number {
  const src = source.toLowerCase();
  let n = childRules.wholeType.get(src)?.size ?? 0;
  for (const count of childRules.specific.get(src)?.values() ?? [])
    n += count;
  return n;
}

export function typeState(
  ruleKeys: Set<string>,
  childRules: ReturnType<typeof buildChildRules>,
  source: string,
  prop: string,
): NodeState {
  const cov = coverage(ruleKeys, '*', prop, source);
  if (cov !== 'none') return cov;
  return blockedChildren(childRules, source, prop) > 0 ? 'partial' : 'none';
}

export function blockedItemsInType(
  ruleKeys: Set<string>,
  childRules: ReturnType<typeof buildChildRules>,
  source: string,
  prop: string,
  count: number,
): number {
  const state = typeState(ruleKeys, childRules, source, prop);
  if (state === 'exact' || state === 'covered') return count;
  if (state === 'partial') return blockedChildren(childRules, source, prop);
  return 0;
}

export function sourceState(
  ruleKeys: Set<string>,
  childRules: ReturnType<typeof buildChildRules>,
  source: string,
): NodeState {
  const cov = coverage(ruleKeys, '*', '*', source);
  if (cov !== 'none') return cov;
  return blockedUnder(childRules, source) > 0 ? 'partial' : 'none';
}

export function blockedItemsInSource(
  ruleKeys: Set<string>,
  childRules: ReturnType<typeof buildChildRules>,
  s: SourceSummary,
): number {
  const state = sourceState(ruleKeys, childRules, s.source);
  if (state === 'exact' || state === 'covered') return s.total;
  let blocked = 0;
  for (const t of s.types)
    blocked += blockedItemsInType(ruleKeys, childRules, s.source, t.prop, t.count);
  return blocked;
}

export function allowedCount(total: number, blocked: number): number {
  return Math.max(0, total - blocked);
}

/** Tooltip phrased around the tick, not around the rule file. */
export function boxTitle(
  ruleKeys: Set<string>,
  state: NodeState,
  what: string,
  source: string,
  prop: string,
  n: number,
): string {
  if (state === 'covered')
    return `${coveredBy(ruleKeys, prop, source)} - tick to allow just ${what}, keeping the rest blocked`;
  if (state === 'partial')
    return `${n} blocked inside - untick to block all ${what}`;
  if (state === 'exact') return `Blocked. Tick to allow ${what} again`;
  return `Untick to block ${what}`;
}

export function coveredBy(
  ruleKeys: Set<string>,
  category: string,
  source: string,
): string {
  if (ruleKeys.has(keyFor('*', '*', source)))
    return `all of ${source} is already blocked`;
  if (ruleKeys.has(keyFor('*', category, source)))
    return `all ${propLabel(category)} from ${source} are already blocked`;
  return '';
}

/** Item rows only ever have the three coverage states. */
export const itemState = (
  ruleKeys: Set<string>,
  hash: string,
  prop: string,
  source: string,
): NodeState => coverage(ruleKeys, hash, prop, source);

/** SourceBrowser shades a row from this; the checkbox carries the detail. */
export const toneOf = (state: NodeState): RowTone =>
  state === 'exact' || state === 'covered'
    ? 'blocked'
    : state === 'partial'
      ? 'partial'
      : null;

export const blocklistSnapshot = (list: BlocklistEntry[]): string =>
  JSON.stringify(list.map(entryKey).sort());

/**
 * Adds rules sent from the site browser. Skips any the list already has or a
 * broader rule already blocks, so a repeat send changes nothing.
 */
export function mergeSiteRules(
  current: BlocklistEntry[],
  incoming: BlocklistEntry[],
): { entries: BlocklistEntry[]; added: number; skipped: number } {
  const keys = new Set(current.map(entryKey));
  const added: BlocklistEntry[] = [];
  for (const rule of incoming) {
    if (coverage(keys, rule.hash, rule.category, rule.source) !== 'none') continue;
    keys.add(entryKey(rule));
    added.push(rule);
  }
  return {
    entries: [...current, ...added],
    added: added.length,
    skipped: incoming.length - added.length,
  };
}
