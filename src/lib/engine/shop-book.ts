/**
 * engine/shop-book.ts — turn resolved shop lists into a 5etools homebrew book.
 *
 * INTENT
 *   The player-facing view of a shop is *not* something this project should
 *   render. A self-hosted 5etools copy already ships the canonical item
 *   renderer (`Renderer.item`), which handles magicvariant `inherits`,
 *   `itemGroup`, fluff and images — everything `render/translate.ts` does not.
 *   So the manager's job is **export**, not display: emit a brew file whose
 *   `book`/`bookData` arrays describe each shop as a chapter of `{@item}`-tagged
 *   tables. 5etools then renders the readable content, with hover stat blocks,
 *   for free — and nothing upstream has to be forked to make it work.
 *
 * DESIGN
 *   One book, one chapter (`section`) per shop, one table per item-type group.
 *   The item cell is `{@item Name|SOURCE}`; cost/weight/qty are plain cells.
 *   Unresolved rows degrade to plain text rather than emitting a broken tag, so
 *   a stale list never renders as a dead link.
 *
 * REUSE NOTES
 *   - Pure: no fs, no DOM, no fetch. Shares `ShopRow` with the Shop view.
 *   - `source` must satisfy the brew schema's `sourceJson`: >= 6 characters, not
 *     an official 5etools source, and not `UA`/`XUA`-prefixed. `DEFAULT_SOURCE`
 *     is chosen to comply; `validateShopBookOptions` re-checks caller input.
 *   - Output shape is validated against schema/brew/homebrew.json — keep it that
 *     way; the Files view's validator can be pointed at the emitted file.
 */
import type { ShopRow } from './item-list.ts';
import { formatValue } from './render/format.ts';

/** Base item type code → display label, shared by the Shop view and this exporter. */
export const ITEM_TYPE_LABELS: Record<string, string> = {
  G: 'Gear',
  A: 'Ammunition',
  T: 'Tool',
  M: 'Melee',
  R: 'Ranged',
  LA: 'Light Armor',
  MA: 'Medium Armor',
  HA: 'Heavy Armor',
  S: 'Shield',
  P: 'Potion',
  SC: 'Scroll',
  RD: 'Rod',
  RG: 'Ring',
  WD: 'Wand',
  SCF: 'Focus',
  FD: 'Food & Drink',
  INS: 'Instrument',
  TG: 'Gaming Set',
  OTH: 'Other',
  GV: 'Variant',
};

export const itemTypeLabel = (code: string): string =>
  ITEM_TYPE_LABELS[code] ?? code;

/** A shop to render as one chapter. `rows`/`totalCp` come straight from resolveItemList. */
export interface ShopBookChapter {
  name: string;
  rows: ShopRow[];
  totalCp: number;
  /** Optional flavour paragraphs rendered above the tables. */
  blurb?: string[];
}

export interface ShopBookOptions {
  /** Brew source code. Schema requires >= 6 chars and no clash with official sources. */
  source?: string;
  /** Corpus id used in `{@book …|id}` tags; defaults to `source`. */
  id?: string;
  /** Book title shown in the nav and list. */
  name?: string;
  full?: string;
  abbreviation?: string;
  author?: string;
  /** YYYY-MM-DD. Defaults to the caller-supplied date, else a fixed placeholder. */
  published?: string;
  color?: string;
  /** Source version string, e.g. "1.0.0". Schema-required on `_meta.sources`. */
  version?: string;
  /** Rules edition hint. 5e (2024) content is `one`; legacy is `classic`. */
  edition?: 'classic' | 'one';
  /** Epoch seconds for `_meta.dateAdded`/`dateLastModified`. Injected so the
   *  engine stays pure and the output stays byte-stable across runs. */
  now?: number;
  /** Split each shop's table by item type. Long inventories are unreadable otherwise. */
  groupByType?: boolean;
  /** Include rows whose hash didn't resolve (as plain text, flagged). Default true. */
  includeUnresolved?: boolean;
  /** Append a "Total" row summarising the chapter's value. Default true. */
  includeTotals?: boolean;
}

const DEFAULT_SOURCE = 'HBMShops';

/** Entry objects are recursive and heterogeneous; this is the shape we emit. */
type Entry = Record<string, unknown>;

export interface ShopBookDoc {
  _meta: {
    sources: Array<Record<string, unknown>>;
    dateAdded: number;
    dateLastModified: number;
    edition: 'classic' | 'one';
  };
  book: Array<Record<string, unknown>>;
  bookData: Array<{ id: string; source: string; data: Entry[] }>;
}

// --- tagging ---------------------------------------------------------------

/**
 * True when a name/source pair is safe to embed in a `{@item …}` tag.
 * 5etools' tag grammar is pipe-delimited and brace-wrapped, so a name carrying
 * those characters would silently corrupt the surrounding entry. Real item names
 * never do — but a homebrew author's might, and a broken book is worse than an
 * untagged row.
 */
export function isTaggable(name: string, source: string): boolean {
  return !!name && !!source && !/[{}|@]/.test(name) && !/[{}|@]/.test(source);
}

/** The item cell for a row: a hoverable `{@item}` (or `{@spell}`) tag, or plain text when unsafe. */
export function itemCell(row: ShopRow): string {
  if (row.found && isTaggable(row.name, row.source))
    return `{@${row.kind === 'spell' ? 'spell' : 'item'} ${row.name}|${row.source}}`;
  const suffix = row.found ? '' : ' {@i (unavailable)}';
  return `${row.name}${suffix}`;
}

const weightCell = (row: ShopRow): string =>
  row.weight != null ? `${row.weight} lb.` : '—';

/** Anchor-safe id for a chapter, so `{@book …|id|chapter}` links stay stable. */
export function chapterId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || String(index).padStart(3, '0');
}

// --- table construction ----------------------------------------------------

const COL_LABELS = ['Item', 'Cost', 'Weight', 'Qty'];
const COL_STYLES = [
  'col-6',
  'col-2 text-center',
  'col-2 text-center',
  'col-2 text-center',
];

function buildTable(rows: ShopRow[], caption?: string): Entry {
  const table: Entry = {
    type: 'table',
    colLabels: [...COL_LABELS],
    colStyles: [...COL_STYLES],
    rows: rows.map((row) => [
      itemCell(row),
      formatValue(row.valueCp),
      weightCell(row),
      String(row.quantity),
    ]),
  };
  if (caption) table.caption = caption;
  return table;
}

/** Group rows by item-type label, unresolved last, preserving within-group order. */
export function groupRowsByType(rows: ShopRow[]): Array<[string, ShopRow[]]> {
  const map = new Map<string, ShopRow[]>();
  for (const row of rows) {
    const label = !row.found
      ? 'Unavailable'
      : row.kind === 'spell'
        ? row.as === 'spell'
          ? 'Spellcasting'
          : 'Spell Scroll'
        : itemTypeLabel(row.type);
    const bucket = map.get(label);
    if (bucket) bucket.push(row);
    else map.set(label, [row]);
  }
  return [...map.entries()].sort(([a], [b]) =>
    a === 'Unavailable' ? 1 : b === 'Unavailable' ? -1 : a.localeCompare(b),
  );
}

function chapterEntries(
  chapter: ShopBookChapter,
  opts: Required<
    Pick<ShopBookOptions, 'groupByType' | 'includeUnresolved' | 'includeTotals'>
  >,
): Entry[] {
  const rows = opts.includeUnresolved
    ? chapter.rows
    : chapter.rows.filter((r) => r.found);
  const entries: Entry[] = [];
  for (const line of chapter.blurb ?? [])
    entries.push(line as unknown as Entry);

  if (!rows.length) {
    entries.push('This shop has no stock.' as unknown as Entry);
    return entries;
  }

  if (opts.groupByType) {
    for (const [label, group] of groupRowsByType(rows)) {
      entries.push({
        type: 'entries',
        name: label,
        entries: [buildTable(group)],
      });
    }
  } else {
    entries.push(buildTable(rows));
  }

  if (opts.includeTotals) {
    const totalCp = rows.reduce(
      (sum, r) => sum + (r.valueCp ?? 0) * r.quantity,
      0,
    );
    const count = rows.reduce((sum, r) => sum + r.quantity, 0);
    entries.push(
      `{@b Total:} ${count} item${count === 1 ? '' : 's'}, ${formatValue(totalCp)}.` as unknown as Entry,
    );
  }
  return entries;
}

// --- public API ------------------------------------------------------------

/**
 * Reject option values the brew schema would reject, with a message a user can
 * act on. Checked here (pure) rather than at the API boundary so the rule lives
 * next to the emitter that depends on it.
 */
export function validateShopBookOptions(opts: ShopBookOptions): string[] {
  const problems: string[] = [];
  const source = opts.source ?? DEFAULT_SOURCE;
  if (source.length < 6)
    problems.push(
      `Source "${source}" is too short — the brew schema requires at least 6 characters.`,
    );
  if (/^X?UA/.test(source))
    problems.push(`Source "${source}" may not start with "UA" or "XUA".`);
  if (!/^[-a-zA-Z0-9&+!][-a-zA-Z0-9&+! ]*[-a-zA-Z0-9&+!]$/.test(source)) {
    problems.push(
      `Source "${source}" contains characters the brew schema disallows.`,
    );
  }
  if (opts.published && !/^\d{4}-\d{2}-\d{2}$/.test(opts.published)) {
    problems.push(`Published date "${opts.published}" must be YYYY-MM-DD.`);
  }
  return problems;
}

/**
 * Build a homebrew brew document containing one book whose chapters are shops.
 *
 * Throws on option values the schema would reject — an invalid brew fails
 * silently and confusingly inside 5etools, so fail loudly here instead.
 */
export function buildShopBook(
  chapters: ShopBookChapter[],
  opts: ShopBookOptions = {},
): ShopBookDoc {
  const problems = validateShopBookOptions(opts);
  if (problems.length) throw new Error(problems.join(' '));

  const source = opts.source ?? DEFAULT_SOURCE;
  const id = opts.id ?? source;
  const settings = {
    groupByType: opts.groupByType ?? true,
    includeUnresolved: opts.includeUnresolved ?? true,
    includeTotals: opts.includeTotals ?? true,
  };

  const sections: Entry[] = chapters.map((chapter, i) => ({
    type: 'section',
    name: chapter.name,
    id: chapterId(chapter.name, i),
    entries: chapterEntries(chapter, settings),
  }));

  const contents = chapters.map((chapter, i) => {
    const rows = settings.includeUnresolved
      ? chapter.rows
      : chapter.rows.filter((r) => r.found);
    const headers = settings.groupByType
      ? groupRowsByType(rows).map(([label]) => label)
      : [];
    const entry: Record<string, unknown> = {
      name: chapter.name,
      ordinal: { type: 'section', identifier: i + 1 },
    };
    if (headers.length) entry.headers = headers;
    return entry;
  });

  // `json`, `abbreviation`, `full` and `version` are all schema-required here.
  const sourceMeta: Record<string, unknown> = {
    json: source,
    abbreviation: opts.abbreviation ?? source,
    full: opts.full ?? opts.name ?? 'Shops',
    version: opts.version ?? '1.0.0',
  };
  if (opts.author) sourceMeta.authors = [opts.author];
  if (opts.color) sourceMeta.color = opts.color;

  const bookEntry: Record<string, unknown> = {
    name: opts.name ?? 'Shops',
    id,
    source,
    group: 'homebrew',
    published: opts.published ?? '1970-01-01',
    contents: contents.length ? contents : [{ name: 'Shops' }],
  };
  if (opts.author) bookEntry.author = opts.author;

  const stamp = opts.now ?? 0;
  return {
    _meta: {
      sources: [sourceMeta],
      dateAdded: stamp,
      dateLastModified: stamp,
      edition: opts.edition ?? 'one',
    },
    book: [bookEntry],
    bookData: [
      {
        id,
        source,
        data: sections.length
          ? sections
          : [
              {
                type: 'section',
                name: 'Shops',
                entries: ['No shops exported.'],
              },
            ],
      },
    ],
  };
}
