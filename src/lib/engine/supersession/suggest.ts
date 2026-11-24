/**
 * engine/supersession/suggest.ts - what a rescan found that isn't mapped yet.
 *
 * "Missing" is tested pair by exact pair, not per original: a spell already
 * pointed at A by hand, whose marker names B, is a real omission - adding B
 * makes it a split, which the format supports. The cost of that choice is that
 * a deliberate difference re-suggests until dismissed, and dismissals are
 * session-scoped by design.
 */
import type { ReplacedByRef, SupersessionRow } from './types.ts';
import { rowKey } from './document.ts';

export interface Suggestion {
  /** The candidate as the scan built it. */
  row: SupersessionRow;
  /** Targets not already present on the matching original. */
  missing: ReplacedByRef[];
}

/**
 * Candidates minus what `rows` already says. Candidates with nothing missing
 * are dropped, so an empty result means the table is current.
 */
export function diffSuggestions(
  candidates: SupersessionRow[],
  rows: SupersessionRow[],
): Suggestion[] {
  const existing = new Map(rows.map((r) => [rowKey(r), r]));
  const out: Suggestion[] = [];
  for (const candidate of candidates) {
    const have = existing.get(rowKey(candidate));
    const seen = new Set(have?.replacedBy.map((t) => t.uid) ?? []);
    const missing = candidate.replacedBy.filter((t) => !seen.has(t.uid));
    if (missing.length) out.push({ row: candidate, missing });
  }
  return out;
}

/**
 * Identity of a suggestion, for keyed rendering and for dismissals. `rowKey`
 * alone is not enough: two homebrew items may both claim the same original,
 * which is a split to review, not a duplicate. The candidate's FULL target
 * list is used rather than what is still missing, so dismissing half a split
 * doesn't re-key the row underneath the reader.
 */
export const suggestionId = (s: Suggestion): string =>
  `${rowKey(s.row)}=>${s.row.replacedBy.map((t) => t.uid).join(',')}`;

/** Identity of one suggested pair - the original's key and one target uid. */
export const suggestionPairKey = (
  row: SupersessionRow,
  target: ReplacedByRef,
): string => `${rowKey(row)}|${target.uid}`;
