/**
 * engine/supersession/document.ts - the mapping file, parsed and rebuilt.
 *
 * INTENT
 *   Round-trip `content-replacement.json` without losing anything, and fold
 *   duplicate rows the same way on every load. Pure; no I/O.
 *
 * DUPLICATES ARE SPLITS, NOT MISTAKES
 *   Two rows claiming the same original is how a one-to-many replacement is
 *   written (SDS breaks Phantasmal Force into Hallucination + Phantasm). They
 *   merge into one row with several `replacedBy` targets, first one primary -
 *   never dropped. The count comes back on the document so the UI can say so,
 *   because an accidental duplicate looks exactly like a deliberate split.
 *
 * FORMATTING
 *   Tab-indented with a trailing newline and rows in a stable order, so a save
 *   that changes one mapping shows as a one-mapping diff.
 */
import type {
  ReplacedByRef,
  ReviewItem,
  SupersessionDocument,
  SupersessionRow,
} from './types.ts';
import { parseOverrideRules } from './override-parse.ts';
import type { OverrideRule } from './override-parse.ts';

// `manual` and `origin` were the old generator's ownership flags. Listed so
// they're dropped on load rather than carried along as unknown fields.
const KNOWN_ROW_FIELDS = new Set([
  'manual',
  'origin',
  'displayName',
  'source',
  'page',
  'hash',
  'prop',
  'replacedBy',
]);

const text = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v ? v : fallback;

/** Runtime identity of a mapping: the original's page + hash. */
export const rowKey = (row: Pick<SupersessionRow, 'page' | 'hash'>): string =>
  `${row.page}|${row.hash}`;

/** Human-readable summary, for banners and confirmations. */
export const describeRow = (row: SupersessionRow): string =>
  `${row.displayName || row.hash} (${row.source}) -> ${row.replacedBy
    .map((it) => it.uid)
    .join(', ')}`;

/** Normalise `replacedBy`, which is an object for one target and an array for a split. */
function readReplacedBy(
  raw: unknown,
  fallbackPage: string,
  fallbackProp: string,
): ReplacedByRef[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: ReplacedByRef[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const ref = item as Record<string, unknown>;
    const uid = text(ref.uid);
    // No uid means nothing to resolve at runtime; the row would be inert.
    if (!uid) continue;
    out.push({
      page: text(ref.page, fallbackPage),
      prop: text(ref.prop, fallbackProp),
      uid,
    });
  }
  return out;
}

/**
 * Parse a mapping file. Tolerant: a malformed row is skipped rather than
 * thrown, so one bad hand-edit doesn't cost the user the other two hundred.
 * Throws only when the payload isn't a mapping file at all.
 */
export function parseSupersessionDocument(json: unknown): SupersessionDocument {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Not a JSON object.');
  }
  const doc = json as Record<string, unknown>;
  if (!Array.isArray(doc.supersession)) {
    throw new Error(
      'No "supersession" array - is this a content-replacement file?',
    );
  }

  const rows: SupersessionRow[] = [];
  const byKey = new Map<string, SupersessionRow>();
  let duplicatesMerged = 0;

  for (const raw of doc.supersession) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const page = text(record.page);
    const hash = text(record.hash);
    const prop = text(record.prop);
    if (!page || !hash) continue;

    const replacedBy = readReplacedBy(record.replacedBy, page, prop);
    if (!replacedBy.length) continue;

    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record))
      if (!KNOWN_ROW_FIELDS.has(k)) extra[k] = v;

    const row: SupersessionRow = {
      displayName: text(record.displayName, hash),
      source: text(record.source),
      page,
      hash,
      prop,
      replacedBy,
      ...(Object.keys(extra).length ? { extra } : {}),
    };

    const kept = byKey.get(rowKey(row));
    if (kept) {
      duplicatesMerged += mergeTargets(kept, row.replacedBy);
      continue;
    }
    byKey.set(rowKey(row), row);
    rows.push(row);
  }

  const review: ReviewItem[] = [];
  if (Array.isArray(doc._review)) {
    for (const raw of doc._review) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const replacement = text(item.replacement);
      if (!replacement) continue;
      review.push({
        replacement,
        reason: text(item.reason, 'unknown'),
        targets: Array.isArray(item.targets)
          ? item.targets.filter((t): t is string => typeof t === 'string')
          : [],
      });
    }
  }

  const overrides = parseOverrideRules(doc.overrides);

  const envelope: Record<string, unknown> = { ...doc };
  delete envelope.supersession;
  delete envelope.overrides;
  delete envelope._review;

  return { rows, review, overrides, envelope, duplicatesMerged };
}

/** Append `targets` to `row`, skipping uids it already has. Returns how many merged. */
function mergeTargets(row: SupersessionRow, targets: ReplacedByRef[]): number {
  let merged = 0;
  for (const to of targets) {
    if (row.replacedBy.some((it) => it.uid === to.uid)) continue;
    row.replacedBy.push(to);
    merged++;
  }
  return merged;
}

/** The file's readme, written on every save. */
export const emptySupersessionEnvelope = (): Record<string, unknown> => ({
  _readme: [
    'Written by the Homebrew Manager\'s Replace Content page. Edit it there.',
    '"_review" is not read at runtime \u2014 it lists "Replaces:" markers the scan refused to guess at.',
  ],
});

/** Page then hash, so a save only moves the rows that changed. */
export const sortRows = (rows: SupersessionRow[]): SupersessionRow[] =>
  [...rows].sort(
    (a, b) => a.page.localeCompare(b.page) || a.hash.localeCompare(b.hash),
  );

export const sortReview = (review: ReviewItem[]): ReviewItem[] =>
  [...review].sort((a, b) => a.replacement.localeCompare(b.replacement));

/**
 * Rebuild the file. `replacedBy` collapses back to a bare object for a single
 * target, which is what most rows look like.
 */
export function serializeSupersessionDocument(
  doc: Pick<SupersessionDocument, 'rows' | 'review' | 'envelope'> & {
    overrides?: OverrideRule[];
  },
) {
  // The readme is ours, so a file still carrying an older one gets the current text.
  const envelope = { ...doc.envelope, ...emptySupersessionEnvelope() };
  delete envelope.overrides;
  // Omitted when empty, so a file with no rules keeps its current bytes.
  const overrides = doc.overrides?.length
    ? [...doc.overrides]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(({ id, prop, from, targets, exclude }) => ({
          id,
          prop,
          from,
          targets: [...targets].sort(),
          exclude: [...exclude].sort(),
        }))
    : null;
  return {
    ...envelope,
    supersession: sortRows(doc.rows).map((row) => ({
      displayName: row.displayName,
      source: row.source,
      page: row.page,
      hash: row.hash,
      prop: row.prop,
      replacedBy:
        row.replacedBy.length === 1 ? row.replacedBy[0] : row.replacedBy,
      ...(row.extra ?? {}),
    })),
    ...(overrides ? { overrides } : {}),
    _review: sortReview(doc.review),
  };
}

/** Tab-indented JSON with a trailing newline, the format the file has always had. */
export const stringifySupersessionFile = (json: unknown): string =>
  `${JSON.stringify(json, null, '\t')}\n`;

export interface MergeRowsResult {
  rows: SupersessionRow[];
  /** Rows that were new. */
  added: number;
  /** Targets folded into an existing row, making it a split. */
  merged: number;
  /** Targets that were already present, so nothing changed. */
  unchanged: number;
}

/**
 * Merge `incoming` into `base`: same page+hash
 * becomes a split, never a replacement or a drop. `base` is not mutated.
 */
export function mergeRows(
  base: SupersessionRow[],
  incoming: SupersessionRow[],
): MergeRowsResult {
  const rows = base.map((row) => ({
    ...row,
    replacedBy: [...row.replacedBy],
  }));
  const byKey = new Map(rows.map((row) => [rowKey(row), row]));
  let added = 0;
  let merged = 0;
  let unchanged = 0;

  for (const row of incoming) {
    const kept = byKey.get(rowKey(row));
    if (!kept) {
      const copy = { ...row, replacedBy: [...row.replacedBy] };
      byKey.set(rowKey(copy), copy);
      rows.push(copy);
      added++;
      continue;
    }
    const before = kept.replacedBy.length;
    const gained = mergeTargets(kept, row.replacedBy);
    if (gained) merged += gained;
    else if (before) unchanged++;
  }

  return { rows, added, merged, unchanged };
}

/** Drop a whole mapping by its page+hash key. */
export const removeRow = (
  rows: SupersessionRow[],
  key: string,
): SupersessionRow[] => rows.filter((row) => rowKey(row) !== key);

/**
 * Drop one target from a split. Removing the last target removes the row -
 * a mapping with nothing to point at is not a mapping.
 */
export function removeTarget(
  rows: SupersessionRow[],
  key: string,
  uid: string,
): SupersessionRow[] {
  const out: SupersessionRow[] = [];
  for (const row of rows) {
    if (rowKey(row) !== key) {
      out.push(row);
      continue;
    }
    const replacedBy = row.replacedBy.filter((it) => it.uid !== uid);
    if (!replacedBy.length) continue;
    const dropped = replacedBy.length !== row.replacedBy.length;
    out.push(dropped ? { ...row, replacedBy } : row);
  }
  return out;
}
