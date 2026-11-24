/**
 * lib/components/source-browser.ts - the types SourceBrowser trades in, and
 * its pure logic: column layout, sorting, search matching, category options.
 *
 * The types mirror what `/api/blocklist/sources` and `/api/blocklist/items`
 * return (`lib/services/content-index-service.ts`), kept here so a component
 * that only wants the shape of a source summary doesn't import the scanner.
 */
import type { Snippet } from 'svelte';
import { compareSourceDates } from '$lib/engine/blocklist';
import { formatNumber, plural } from '$lib/util';

export interface SourceTypeCount {
  prop: string;
  label: string;
  count: number;
}

export interface SourceSummary {
  source: string;
  full: string;
  isHomebrew: boolean;
  /** A 5etools partnered source, read from the partnered brew repo. */
  isPartnered: boolean;
  /** Pulled in by a local brew's `_meta.dependencies` / `includes`. */
  isDependency: boolean;
  total: number;
  types: SourceTypeCount[];
  /** Epoch ms, or null where the corpus carries no date. */
  dateAdded: number | null;
  dateKind: 'brew' | 'published' | null;
}

export interface IndexedEntity {
  prop: string;
  source: string;
  hash: string;
  name: string;
}

export interface CorpusMeta {
  entityCount: number;
  duplicateEntities: number;
  fileCount: number;
  skipped: string[];
}

/** An entry as the browser hands it back when you click one. */
export interface ItemPick {
  source: SourceSummary;
  prop: string;
  item: IndexedEntity;
  /** Held modifiers, so a caller can implement range or additive selection. */
  event: MouseEvent | KeyboardEvent;
}

/**
 * Row shading. `null` is the ordinary state.
 *
 * `blocked` and `partial` describe a row's state in the list the page is
 * AUTHORING. `blocklisted` is different in kind: it says the content is hidden
 * by `content-blocklist.json`, which no page but the Blocklist authors. It gets
 * its own tone so a page already spending `blocked` on its own meaning - the
 * Replacement page greys entries it has used as a replacement - can show both
 * without the two collapsing into one grey.
 */
export type RowTone = 'blocked' | 'partial' | 'blocklisted' | null;

/** Cache/selection identity for one entry. */
export const itemKey = (source: string, prop: string, hash: string): string =>
  `${source}|${prop}|${hash}`;

/**
 * A column SourceBrowser can draw. The array both selects the columns and sets
 * their left-to-right order, so a page that wants the count before the date
 * says so by writing it that way.
 *
 * `abbr`, `name` and `tags` are the lead columns: a type or entry row's label
 * spans them, and only what follows gets its own cell on those rows. Keep them
 * first, and keep `actions` last.
 *
 * The Blocklist takes DEFAULT_COLUMNS; the picker declares its own order and
 * appends `'actions'`.
 */
export type ColumnKey =
  'abbr' | 'name' | 'tags' | 'count' | 'added' | 'actions';

/**
 * Today's Blocklist header, in today's order.
 *
 * `readonly` because it is a prop's default value: every browser taking the
 * default shares this one instance, so a `push` or a `sort` anywhere would
 * silently reconfigure a page nobody touched. The type refuses it at the call
 * site, which is where the mistake would be made.
 */
export const DEFAULT_COLUMNS: readonly ColumnKey[] = [
  'abbr',
  'name',
  'tags',
  'added',
  'count',
] as const;

/** Key for one source + content type in the entry cache and the open set. */
export const typeKey = (source: string, prop: string): string =>
  `${source}|${prop}`;

/** DOM id of a source's card. */
export const cardId = (source: string): string =>
  `src-${source.replace(/[^A-Za-z0-9]/g, '_')}`;

// --- columns -----------------------------------------------------------------

export interface ColumnLayout {
  /**
   * The columns actually drawn, in the order the caller asked for. Every cell
   * in the header and in a source row is emitted by walking THIS - so a column
   * cannot be drawn out of position by testing for it somewhere else.
   */
  drawn: ColumnKey[];
  /** True when the abbreviation has a column of its own to sit in. */
  hasAbbrColumn: boolean;
  /** True when entry rows draw the caller's per-entry controls. */
  hasActions: boolean;
  /** Whichever expander column comes first hosts the expand-all chevron. */
  chevHost: 'abbr' | 'name' | null;
  /**
   * What a type row draws to the right of its label: its count, then an empty
   * cell for every column that follows, so the count lands under Count whatever
   * the order is. Columns BEFORE the count need nothing - the label spans them,
   * exactly as it did when a type row was label-then-count and nothing else.
   */
  typeTrailing: ColumnKey[];
}

/**
 * `actions` needs a snippet as well as the key: an empty trailing column would
 * just steal width from the title.
 */
export function columnLayout(
  columns: readonly ColumnKey[],
  hasActionSnippet: boolean,
): ColumnLayout {
  const drawn = columns.filter((c) => c !== 'actions' || hasActionSnippet);
  const at = drawn.indexOf('count');
  return {
    drawn,
    hasAbbrColumn: drawn.includes('abbr'),
    hasActions: drawn.includes('actions'),
    chevHost:
      (drawn.find((c) => c === 'abbr' || c === 'name') as
        'abbr' | 'name' | undefined) ?? null,
    typeTrailing: at === -1 ? [] : drawn.slice(at),
  };
}

// --- sorting -----------------------------------------------------------------

export type SortKey = 'source' | 'name' | 'dateAdded' | 'total';
export interface SourceSort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Which way a column wants to point the first time you click it. */
const NATURAL_DIR: Record<SortKey, 'asc' | 'desc'> = {
  source: 'asc', // abbreviation A-Z
  name: 'asc', // full title A-Z
  dateAdded: 'desc', // newest first - "what did I add lately"
  total: 'desc', // biggest first
};

/** Clicking a header: flip the direction, or switch to its natural one. */
export const nextSort = (sort: SourceSort, key: SortKey): SourceSort =>
  sort.key === key
    ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: NATURAL_DIR[key] };

export const sortArrow = (sort: SourceSort, key: SortKey): string =>
  sort.key !== key ? '' : sort.dir === 'asc' ? '▲' : '▼';

/**
 * Sources in display order. Ties fall back to title, then abbreviation, so
 * equal dates/counts stay in a stable, readable order rather than whatever the
 * scan happened to produce.
 */
export function sortSources(
  list: readonly SourceSummary[],
  { key, dir }: SourceSort,
): SourceSummary[] {
  const byAbbr = (a: SourceSummary, b: SourceSummary) =>
    a.source.localeCompare(b.source);
  const byTitle = (a: SourceSummary, b: SourceSummary) =>
    a.full.localeCompare(b.full) || byAbbr(a, b);
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'dateAdded') {
      return compareSourceDates(a.dateAdded, b.dateAdded, dir) || byTitle(a, b);
    }
    if (key === 'total') {
      return (
        (dir === 'asc' ? a.total - b.total : b.total - a.total) || byTitle(a, b)
      );
    }
    if (key === 'name') {
      const n = a.full.localeCompare(b.full);
      return n ? n * sign : byAbbr(a, b);
    }
    const s = byAbbr(a, b);
    return s ? s * sign : a.full.localeCompare(b.full);
  });
}

// --- searching and filtering -------------------------------------------------

/** A source whose abbreviation or title contains `q` (already lowercased). */
export const sourceMatches = (s: SourceSummary, q: string): boolean =>
  s.source.toLowerCase().includes(q) || s.full.toLowerCase().includes(q);

export interface CategoryOption {
  prop: string;
  label: string;
  sources: number;
  items: number;
}

/**
 * Every type present anywhere in the corpus, label-sorted, with totals.
 *
 * Sorted explicitly, not left in Map insertion order: that order is
 * "whichever type this corpus happened to mention first", which reads as
 * random in a forty-odd-option select. Alphabetical by the label shown, so
 * you can find a category before opening the list. (The type rows under each
 * source keep the catalog's curated order - that list is short and grouped.)
 */
export function categoryOptions(
  sources: readonly SourceSummary[],
): CategoryOption[] {
  const tally = new Map<
    string,
    { label: string; sources: number; items: number }
  >();
  for (const s of sources) {
    for (const t of s.types) {
      const e = tally.get(t.prop) ?? { label: t.label, sources: 0, items: 0 };
      e.sources++;
      e.items += t.count;
      tally.set(t.prop, e);
    }
  }
  return [...tally.entries()]
    .map(([prop, e]) => ({ prop, ...e }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The line under the search box once results are in. The cap is stated rather
 * than applied silently: a search that quietly hides the entity you are
 * looking for reads as "it isn't in the corpus".
 */
export function searchNote(
  q: string,
  result: { shown: number; total: number; truncated: boolean },
): string {
  if (!result.total) return `Nothing matches "${q}".`;
  return result.truncated
    ? `Showing ${formatNumber(result.shown)} of ${formatNumber(result.total)} matches - narrow the search.`
    : `${formatNumber(result.total)} ${plural(result.total, 'match', 'matches')}.`;
}

/** Says which stamp a row is showing, since the Added column mixes two. */
export function dateTitle(s: SourceSummary): string {
  if (s.dateAdded === null) return 'No date recorded for this source';
  return s.dateKind === 'brew'
    ? `Added to your homebrew folder (${s.source} _meta.dateAdded)`
    : 'Publication date (from books.json / adventures.json)';
}

// --- what a source row needs from the page -------------------------------------

/**
 * The caller's per-row hooks, passed through SourceBrowser to SourceRow
 * unchanged. See SourceBrowser's Props for what each one is for.
 */
export interface RowHooks {
  sourceTone?: (s: SourceSummary) => RowTone;
  typeTone?: (s: SourceSummary, t: SourceTypeCount) => RowTone;
  itemTone?: (source: string, prop: string, item: IndexedEntity) => RowTone;
  itemActions?: Snippet<[SourceSummary, SourceTypeCount, IndexedEntity]>;
  typeActions?: Snippet<[SourceSummary, SourceTypeCount]>;
  sourceLead?: Snippet<[SourceSummary]>;
  typeLead?: Snippet<[SourceSummary, SourceTypeCount]>;
  itemLead?: Snippet<[SourceSummary, SourceTypeCount, IndexedEntity]>;
  sourceCount?: Snippet<[SourceSummary]>;
  typeCount?: Snippet<[SourceSummary, SourceTypeCount]>;
  onPickItem?: (pick: ItemPick) => void;
  selectedKeys?: Set<string>;
  noTypesMessage?: (s: SourceSummary) => string;
}
