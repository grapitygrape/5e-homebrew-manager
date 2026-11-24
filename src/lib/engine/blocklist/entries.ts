/**
 * engine/blocklist/entries.ts — the content-blocklist file, parsed and rebuilt.
 *
 * INTENT
 *   Read a `content-blocklist.json` without losing anything, edit the rule list,
 *   and write it back in a shape 5etools will import. The envelope
 *   (`siteVersion`, `fileType`, `_meta`) and any unrecognised per-entry fields
 *   are carried through untouched, so a round-trip through this manager is not
 *   destructive. Pure; no I/O.
 *
 * IDENTITY
 *   A rule is identified by `hash__category__source`, lowercased — the same
 *   exact-match key 5etools' `ExcludeUtil._getCacheUids(…, {isExact: true})`
 *   builds. Two rules with that key are the same rule, whatever their
 *   `displayName` says.
 */

/** One blocklist rule. `*` in any of hash/category/source is a wildcard. */
export interface BlocklistEntry {
  displayName: string;
  hash: string;
  category: string;
  source: string;
  /** 5etools marks auto-managed rules; they're preserved but not user-removable. */
  isAuto: boolean;
  /** Any fields we didn't recognise, preserved verbatim on save. */
  extra?: Record<string, unknown>;
}

/** A parsed blocklist file: the rules plus the envelope they arrived in. */
export interface BlocklistDocument {
  entries: BlocklistEntry[];
  /** Everything in the file except `blocklist`, preserved for the round-trip. */
  envelope: Record<string, unknown>;
  /** Exact-duplicate rules collapsed on parse (see `parseBlocklistDocument`). */
  duplicatesRemoved: number;
}

const KNOWN_ENTRY_FIELDS = new Set([
  'displayName',
  'hash',
  'category',
  'source',
  'isAuto',
]);

const text = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v ? v : fallback;

/** Exact-match identity for a rule (5etools' `hash__category__source` cache uid). */
export const entryKey = (
  e: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>,
): string =>
  `${e.hash.toLowerCase()}__${e.category.toLowerCase()}__${e.source.toLowerCase()}`;

/** Human-readable summary of a rule, for messages and the UI. */
export function describeEntry(e: BlocklistEntry): string {
  if (e.hash === '*' && e.category === '*')
    return `all content from ${e.source}`;
  if (e.hash === '*') return `all ${e.category} from ${e.source}`;
  return `${e.displayName || e.hash} (${e.category}, ${e.source})`;
}

/**
 * Parse a blocklist file. Tolerant by design: a malformed entry is dropped
 * rather than throwing, because a single bad rule shouldn't cost the user their
 * whole list. Throws only when the payload isn't a blocklist at all.
 *
 * DUPLICATES are collapsed, keeping the first. Real files carry them — 5etools
 * only dedupes on *add*, so a hand-edit or a merge of two exports can leave two
 * identical rules behind. They're inert to 5etools (same cache uid, set twice)
 * but they'd be two rows here with one identity, so they go on the way in.
 */
export function parseBlocklistDocument(json: unknown): BlocklistDocument {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Not a JSON object.');
  }
  const doc = json as Record<string, unknown>;
  const fileType = doc.fileType;
  if (typeof fileType === 'string' && fileType !== 'content-blocklist') {
    throw new Error(
      `Wrong file type: expected a content blocklist, got "${fileType}".`,
    );
  }
  if (!Array.isArray(doc.blocklist)) {
    throw new Error(
      'No "blocklist" array — is this a 5etools blocklist export?',
    );
  }

  const entries: BlocklistEntry[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  for (const raw of doc.blocklist) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const hash = text(row.hash);
    const category = text(row.category);
    const source = text(row.source);
    // 5etools itself refuses to store a rule missing any of the three.
    if (!hash || !category || !source) continue;

    const key = entryKey({ hash, category, source });
    if (seen.has(key)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(key);

    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row))
      if (!KNOWN_ENTRY_FIELDS.has(k)) extra[k] = v;

    entries.push({
      displayName: text(row.displayName, hash === '*' ? '*' : hash),
      hash,
      category,
      source,
      isAuto: row.isAuto === true,
      ...(Object.keys(extra).length ? { extra } : {}),
    });
  }

  const envelope: Record<string, unknown> = { ...doc };
  delete envelope.blocklist;
  return { entries, envelope, duplicatesRemoved };
}

/** Default envelope for a blocklist created from scratch. */
export const emptyEnvelope = (): Record<string, unknown> => ({
  fileType: 'content-blocklist',
  _meta: { sources: [], dateAdded: 0, dateLastModified: 0 },
});

/**
 * Rebuild the file. Entry field order matches 5etools' own export so a diff
 * against a file it wrote stays readable.
 */
export function serializeBlocklistDocument(
  doc: Pick<BlocklistDocument, 'entries' | 'envelope'>,
): Record<string, unknown> {
  const envelope = Object.keys(doc.envelope).length
    ? doc.envelope
    : emptyEnvelope();
  return {
    ...envelope,
    fileType: 'content-blocklist',
    blocklist: doc.entries.map((e) => ({
      displayName: e.displayName,
      hash: e.hash,
      category: e.category,
      source: e.source,
      isAuto: e.isAuto,
      ...(e.extra ?? {}),
    })),
  };
}

/** Merge `incoming` into `base`, skipping rules that already exist. */
export function mergeEntries(
  base: BlocklistEntry[],
  incoming: BlocklistEntry[],
): { entries: BlocklistEntry[]; added: number; skipped: number } {
  const seen = new Set(base.map(entryKey));
  const entries = [...base];
  let added = 0;
  let skipped = 0;
  for (const e of incoming) {
    const key = entryKey(e);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    entries.push(e);
    added++;
  }
  return { entries, added, skipped };
}

/** Stable sort for display: source, then category, then name. */
export function sortEntries(entries: BlocklistEntry[]): BlocklistEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.source.localeCompare(b.source) ||
      a.category.localeCompare(b.category) ||
      a.displayName.localeCompare(b.displayName),
  );
}
