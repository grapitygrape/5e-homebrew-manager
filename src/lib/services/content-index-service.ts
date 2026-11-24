/**
 * lib/services/content-index-service.ts — the content index behind Hide
 * Content, Replace Content and the Dashboard source counts.
 *
 * INTENT
 *   Answer three questions cheaply: which sources exist, what content types does
 *   a source contain (and how many of each), and what are the individual entries
 *   of one source+type. One scan over the data root plus the homebrew folder
 *   builds all three; the result is memoized like the schema/audit caches.
 *
 * WHY A FULL SCAN
 *   The blocklist spans every content type 5etools knows — creatures, deities,
 *   languages, decks, books — while `OFFICIAL_SOURCES` wires up the seventeen the
 *   merge pipeline needs. Rather than hand-map another thirty files, the index
 *   walks the data root and keeps the props on the catalog allowlist. The
 *   `adventure/` and `book/` directories are skipped: ~67 MB of prose under props
 *   5etools itself ignores, with the blockable `adventure`/`book` records living
 *   in the small top-level files instead.
 *
 * COST
 *   ~28 MB parsed, ~20k indexed entities, a couple of seconds cold on a local
 *   disk, then free. Held entirely in memory — only identity fields are kept
 *   (prop, source, hash, name), never the entity bodies.
 *
 * MODULES
 *   content-index-scan.ts reads the corpus, content-index-accumulator.ts
 *   ingests each file, content-index-graph.ts links parents to children, and
 *   content-index-cache.ts keeps the result on disk between launches.
 */
import { cachedResource, getDataSource } from './datasource';
import { configProvider } from './config';
import {
  computeCorpusStamp,
  hydrateContentIndexSnapshot,
  readContentIndexCache,
  serializeContentIndex,
  writeContentIndexCache,
  type HydratedIndexData,
} from './content-index-cache';
import { scanCorpus } from './content-index-scan';
import type { DataSource } from '$lib/data';
import {
  isIndexableDataFile,
  collectDescendants,
  findAllowedWithBlockedParents,
} from '$lib/engine/blocklist';
import type {
  AllowedChildWithBlockedParent,
  ContentLookup,
  IndexedEntity,
  BlocklistEntry,
  SourceDateKind,
} from '$lib/engine/blocklist';

export interface SourceTypeCount {
  prop: string;
  label: string;
  count: number;
}

export interface SourceSummary {
  /** Source abbreviation as it appears on entities (`PHB`, `VSS`). */
  source: string;
  /** Full title where we can resolve one, else the abbreviation. */
  full: string;
  isHomebrew: boolean;
  /**
   * A 5etools *partnered* source — a licensed third-party book the site offers
   * behind "Load All Partnered Content", read from the configured homebrew-repo
   * checkout rather than the user's own homebrew folder. Still `isHomebrew`:
   * that is what it is to the merge and to the blocklist.
   */
  isPartnered: boolean;
  /**
   * Loaded because a local brew's `_meta.dependencies` names it. 5etools pulls
   * in the whole file, so every entity in it is live on the site. Also
   * `isHomebrew`; takes precedence over `isPartnered` for display.
   */
  isDependency: boolean;
  /** Total indexed entities in this source. */
  total: number;
  types: SourceTypeCount[];
  /**
   * Epoch ms for the Added column — a brew's `_meta.dateAdded` or an official
   * book's `published`. `null`, never 0, when the corpus doesn't say.
   */
  dateAdded: number | null;
  /** Which stamp the date came from, so the UI can say so. */
  dateKind: SourceDateKind | null;
}

export interface ContentIndex extends ContentLookup {
  sources: SourceSummary[];
  entityCount: number;
  fileCount: number;
  /** Entities collapsed because another entity in the same source shared its hash. */
  duplicateEntities: number;
  builtAt: number;
  durationMs: number;
  /** Files that failed to parse — surfaced so a broken file isn't invisible. */
  skipped: string[];
  itemsFor(source: string, prop: string): IndexedEntity[];
  summaryFor(source: string): SourceSummary | undefined;
  /** Structural descendants (subclasses, subraces, derived items, etc.) of a rule target. */
  childrenFor(target: {
    source: string;
    category: string;
    hash: string;
  }): IndexedEntity[];
  /** Every allowed entity whose parent/ancestor is blocked under `entries`. */
  allowedWithBlockedParents(
    entries: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>[],
  ): AllowedChildWithBlockedParent[];
}

let bypassDiskCache = false;
const contentIndexCache = cachedResource(() => {
  const skipDisk = bypassDiskCache;
  bypassDiskCache = false;
  return loadContentIndex(getDataSource(), skipDisk);
});

/** Drop the cached index (called on a config change, or after a homebrew edit). */
export const resetContentIndex = (): void => contentIndexCache.reset();

/** Whether a built index is already in memory (lets the UI warn about a cold scan). */
export const isIndexReady = (): boolean => contentIndexCache.isReady();

function createContentIndex(
  data: HydratedIndexData,
  durationMs: number,
): ContentIndex {
  const {
    sources,
    bySource,
    byPropHash,
    childrenByParent,
    parents,
    entityCount,
    duplicateEntities,
    fileCount,
    builtAt,
    skipped,
  } = data;

  return {
    sources,
    entityCount,
    duplicateEntities,
    fileCount,
    builtAt,
    durationMs,
    skipped,
    hasSource: (source) => bySource.has(source.toLowerCase()),
    find: (prop, hash) => byPropHash.get(prop)?.get(hash.toLowerCase()),
    findByName: (source, name) => {
      const byProp = bySource.get(source.toLowerCase());
      if (!byProp) return [];
      const needle = name.toLowerCase();
      const out: IndexedEntity[] = [];
      for (const list of byProp.values()) {
        for (const e of list) if (e.name.toLowerCase() === needle) out.push(e);
      }
      return out;
    },
    itemsFor: (source, prop) =>
      bySource.get(source.toLowerCase())?.get(prop) ?? [],
    summaryFor: (source) =>
      sources.find((s) => s.source.toLowerCase() === source.toLowerCase()),
    childrenFor: ({ source, category, hash }) => {
      const seeds: IndexedEntity[] = [];
      if (hash === '*' && category === '*') {
        if (source === '*') return [];
        const byProp = bySource.get(source.toLowerCase());
        if (byProp) {
          for (const list of byProp.values()) seeds.push(...list);
        }
      } else if (hash === '*') {
        if (source === '*') {
          const all = byPropHash.get(category);
          if (all) seeds.push(...all.values());
        } else {
          seeds.push(
            ...(bySource.get(source.toLowerCase())?.get(category) ?? []),
          );
        }
      } else {
        const hit = byPropHash.get(category)?.get(hash.toLowerCase());
        if (hit) seeds.push(hit);
      }
      if (!seeds.length) return [];
      return collectDescendants(seeds, (k) => childrenByParent.get(k));
    },
    allowedWithBlockedParents: (entries) =>
      findAllowedWithBlockedParents(
        parents.values(),
        (k) => childrenByParent.get(k),
        entries,
      ),
  };
}

/** Serve the disk snapshot when the corpus stamp still matches, else scan and save. */
async function loadContentIndex(
  ds: DataSource,
  skipDiskCache = false,
): Promise<ContentIndex> {
  const started = Date.now();

  let dataFiles: string[] = [];
  try {
    dataFiles = (await ds.listDataFiles()).filter(isIndexableDataFile);
  } catch (err) {
    throw new Error(
      `Could not enumerate the 5etools data folder: ${(err as Error).message} ` +
        `Set a local path for the data source in Settings.`,
    );
  }

  const provider = configProvider();
  const configRoot = provider.root();
  const stamp = await computeCorpusStamp(
    configRoot,
    provider.effectiveConfig(),
    dataFiles,
  );
  if (stamp && !skipDiskCache) {
    const cached = await readContentIndexCache(configRoot, stamp);
    if (cached) {
      return createContentIndex(
        hydrateContentIndexSnapshot(cached),
        Date.now() - started,
      );
    }
  }

  const data = await scanCorpus(ds, dataFiles);
  if (stamp) {
    await writeContentIndexCache(
      configRoot,
      serializeContentIndex(stamp, data),
    );
  }
  return createContentIndex(data, Date.now() - started);
}

/** The content index, building it on first use. Concurrent callers share one build. */
export const getContentIndex = (force = false): Promise<ContentIndex> => {
  if (force) bypassDiskCache = true;
  return contentIndexCache.get(force);
};

export interface SourceListing {
  sources: SourceSummary[];
  entityCount: number;
  duplicateEntities: number;
  fileCount: number;
  skipped: string[];
  builtAt: number;
  durationMs: number;
  /** True when this call paid for the scan (lets the UI explain the wait). */
  wasColdStart: boolean;
}

/**
 * Every source with its type counts, without the entries: a source like MM
 * carries thousands, and the UI only needs them once a type is expanded.
 */
export async function listSources(refresh = false): Promise<SourceListing> {
  const wasReady = isIndexReady();
  const index = await getContentIndex(refresh);
  return {
    sources: index.sources,
    entityCount: index.entityCount,
    duplicateEntities: index.duplicateEntities,
    fileCount: index.fileCount,
    skipped: index.skipped,
    builtAt: index.builtAt,
    durationMs: index.durationMs,
    wasColdStart: !wasReady,
  };
}

/** Sorted, searchable entries for one source + content type. */
export async function listSourceItems(
  source: string,
  prop: string,
): Promise<IndexedEntity[]> {
  const index = await getContentIndex();
  return [...index.itemsFor(source, prop)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** Structural descendants (subclasses, subraces, derived items, etc.) of a blocklist target. */
export async function listBlocklistChildren(
  source: string,
  category: string,
  hash: string,
): Promise<IndexedEntity[]> {
  const index = await getContentIndex();
  return index.childrenFor({ source, category, hash });
}

/** Allowed entities whose parent/ancestor is blocked under `entries`. */
export async function listAllowedWithBlockedParents(
  entries: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>[],
): Promise<AllowedChildWithBlockedParent[]> {
  const index = await getContentIndex();
  return index.allowedWithBlockedParents(entries);
}

/**
 * Every entry of one content type, grouped by source.
 *
 * Exists for the category filter, which opens that type in every source at
 * once. Done per-source that would be 156 requests for `monster`; the whole
 * corpus's creatures is one response and roughly a megabyte, which on a local
 * tool is the cheaper trade by a wide margin. Sources with none are omitted.
 */
export async function listItemsByProp(
  prop: string,
): Promise<Record<string, IndexedEntity[]>> {
  const index = await getContentIndex();
  const out: Record<string, IndexedEntity[]> = {};
  for (const summary of index.sources) {
    const items = index.itemsFor(summary.source, prop);
    if (items.length) {
      out[summary.source] = [...items].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }
  }
  return out;
}

export interface EntitySearchResult {
  hits: IndexedEntity[];
  total: number;
  /** True when `hits` is a prefix of `total` - the caller should say so. */
  truncated: boolean;
}

/**
 * Entities whose name or source contains `query`, across the whole corpus.
 *
 * Exists because the picker searches everything at once and bulk-loading every
 * prop into the browser is not viable - `monster` alone is about a megabyte.
 * The index is already in memory, so a scan per keystroke is cheaper than the
 * transfer would be; callers debounce and pass a limit anyway.
 */
export async function searchEntities(
  query: string,
  opts: { prop?: string; limit?: number } = {},
): Promise<EntitySearchResult> {
  const q = query.trim().toLowerCase();
  const limit = opts.limit ?? 100;
  if (q.length < 2) return { hits: [], total: 0, truncated: false };

  const index = await getContentIndex();
  const hits: IndexedEntity[] = [];
  let total = 0;

  // Names only. The browser matches source abbreviations and titles itself
  // and draws a matching source whole; counting its entries here too would
  // spend the cap on one book and truncate everything else.
  for (const summary of index.sources) {
    for (const type of summary.types) {
      if (opts.prop && type.prop !== opts.prop) continue;
      for (const item of index.itemsFor(summary.source, type.prop)) {
        if (!item.name.toLowerCase().includes(q)) continue;
        total++;
        if (hits.length < limit) hits.push(item);
      }
    }
  }

  hits.sort(
    (a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
  );
  return { hits, total, truncated: total > hits.length };
}
