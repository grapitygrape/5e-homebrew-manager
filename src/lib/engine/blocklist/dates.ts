/**
 * engine/blocklist/dates.ts — when did a source enter the corpus?
 *
 * INTENT
 *   The Sources list wants one sortable "Added" column, but the corpus keeps two
 *   different stamps and neither covers everything:
 *
 *     homebrew  `_meta.dateAdded`   epoch SECONDS — when the brew landed in the
 *                                   folder. A true "added" date. ~71 of 72 files.
 *     official  `published`         "2014-08-19" in books.json / adventures.json
 *                                   — a publication date, the closest honest
 *                                   proxy for official material. ~161 of 178.
 *
 *   This module normalises both to epoch MILLISECONDS, states which one wins
 *   when a source somehow offers both, and gives the UI a comparator. Nothing
 *   here reads a file; the scan in services/content-index-service.ts feeds it.
 *
 * WHY NOT FILE MTIME
 *   It would be uniform and always present, and it would be a lie: copying the
 *   homebrew folder rewrites every mtime to the same afternoon.
 *
 * UNDATED IS NOT ZERO
 *   A source with no stamp gets `null`, never 0. Zero would sort as 1970 and
 *   quietly claim to be the oldest thing you own; `null` sorts to the bottom in
 *   both directions, which is what "we don't know" actually means.
 */

/** Which stamp a date came from — drives the column's tooltip. */
export type SourceDateKind = 'brew' | 'published';

export interface SourceDate {
  /** Epoch milliseconds. */
  at: number;
  kind: SourceDateKind;
}

/** Seconds this large would be the year 56000, so the value is already ms. */
const MS_THRESHOLD = 1e11;

const PUBLISHED_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A 5etools `published` date ("2014-08-19") as epoch ms at UTC midnight.
 *
 * Parsed by hand rather than through `new Date(str)`: the calendar day is the
 * whole point of the column, and letting the runtime apply a local-time offset
 * shows PHB as the 18th for anyone west of Greenwich. Also rejects impossible
 * dates, which `Date` would silently roll forward (Feb 30 → Mar 2).
 */
export function parsePublishedDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = PUBLISHED_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y),
    month = Number(mo),
    day = Number(d);
  const at = Date.UTC(year, month - 1, day);
  const back = new Date(at);
  // Round-trip check: catches 2014-13-01 and 2014-02-30 alike.
  if (
    back.getUTCFullYear() !== year ||
    back.getUTCMonth() !== month - 1 ||
    back.getUTCDate() !== day
  ) {
    return null;
  }
  return at;
}

/**
 * A homebrew `_meta.dateAdded` as epoch ms. The field is documented as seconds
 * and is seconds in every file we have, but a hand-edited brew can carry ms —
 * so anything past the threshold is taken at face value instead of being
 * multiplied into the year 56000.
 */
export function parseBrewDateAdded(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n >= MS_THRESHOLD ? n : n * 1000;
}

/**
 * Which of two candidate dates a source keeps.
 *
 * A brew stamp always beats a published one — it describes this collection,
 * while `published` describes the wider world. Between two of the same kind the
 * earlier wins: if a source is declared in more than one file, the question
 * "when did this arrive" is answered by the first time it showed up.
 */
export function preferDate(
  current: SourceDate | undefined,
  next: SourceDate,
): SourceDate {
  if (!current) return next;
  if (current.kind !== next.kind)
    return current.kind === 'brew' ? current : next;
  return next.at < current.at ? next : current;
}

/**
 * Comparator for the Added column. Undated sources sink to the bottom whichever
 * way the column is pointed — see "UNDATED IS NOT ZERO" above.
 */
export function compareSourceDates(
  a: number | null,
  b: number | null,
  dir: 'asc' | 'desc',
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === 'asc' ? a - b : b - a;
}
