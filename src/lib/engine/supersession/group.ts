/**
 * engine/supersession/group.ts - the two shapes the Replacements table reads.
 *
 * The file stores one row per ORIGINAL, which is what the runtime resolves
 * against. That is not what a person reads: 104 of the live file's 278 rows are
 * PHB/XPHB pairs of one spell pointing at one homebrew, and shown raw they look
 * like duplicates. Grouping is a view concern, so it lives here rather than in
 * the document module that owns the file's real shape.
 *
 * Both functions are total and order-independent; the key ignores target order
 * so a row written `[A, B]` groups with one written `[B, A]`.
 */
import type { ReplacedByRef, SupersessionRow } from './types.ts';
import { rowKey } from './document.ts';

export interface MappingGroup {
  /** Stable identity for keyed rendering; opaque. */
  key: string;
  /** The replacements this group's originals point at. */
  replacements: ReplacedByRef[];
  /** Every original in the group, in the order the rows arrived. */
  originals: SupersessionRow[];
}

const SEP = '​';

/** Order-independent identity of a row's target set. */
const targetSetKey = (row: SupersessionRow): string =>
  row.replacedBy
    .map((t) => t.uid)
    .sort((a, b) => a.localeCompare(b))
    .join(SEP);

/** Groups sort by their primary replacement, so the table order is stable. */
const byPrimary = (a: MappingGroup, b: MappingGroup): number =>
  (a.replacements[0]?.uid ?? '').localeCompare(b.replacements[0]?.uid ?? '') ||
  a.key.localeCompare(b.key);

/**
 * One group per distinct target SET - the default, replacement-first view.
 * Rows pointing at the same replacements collapse into one line.
 */
export function groupByReplacementSet(rows: SupersessionRow[]): MappingGroup[] {
  const byKey = new Map<string, MappingGroup>();
  for (const row of rows) {
    const key = targetSetKey(row);
    const found = byKey.get(key);
    if (found) {
      found.originals.push(row);
      continue;
    }
    byKey.set(key, {
      key,
      replacements: [...row.replacedBy],
      originals: [row],
    });
  }
  return [...byKey.values()].sort(byPrimary);
}

/**
 * One group per INDIVIDUAL replacement - the swapped, original-first view.
 *
 * Grouping by original set would be a no-op: `page` + `hash` is unique per row,
 * so every original appears exactly once. Keying on the target instead answers
 * the question the swapped view actually asks - what does this homebrew
 * supersede - and a split row legitimately appears under each of its targets.
 */
export function groupByReplacement(rows: SupersessionRow[]): MappingGroup[] {
  const byUid = new Map<string, MappingGroup>();
  for (const row of rows) {
    for (const ref of row.replacedBy) {
      const found = byUid.get(ref.uid);
      if (found) {
        found.originals.push(row);
        continue;
      }
      byUid.set(ref.uid, {
        key: ref.uid,
        replacements: [ref],
        originals: [row],
      });
    }
  }
  return [...byUid.values()].sort(byPrimary);
}

/** The document-level identities a group covers, for delete and edit. */
export const groupRowKeys = (group: MappingGroup): string[] =>
  group.originals.map(rowKey);
