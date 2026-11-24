/**
 * lib/services/content-index-accumulator.ts — the mutable state one content
 * index scan fills as it reads each file, and the per-file ingest steps:
 * blockable entities, source titles and dates, and a brew's declared sources.
 * Races and parent → child links are held back until the whole corpus is in
 * (see content-index-graph.ts).
 */
import {
  BLOCKLIST_PROPS,
  BLOCKLIST_PROP_ORDER,
  isBlockableProp,
  entityHash,
  entitySource,
  flattenRacesWithParents,
  extractParentLinks,
  extractItemGroupMembers,
  parsePublishedDate,
  parseBrewDateAdded,
  preferDate,
} from '$lib/engine/blocklist';
import type {
  IndexedEntity,
  RawRace,
  RawSubrace,
  FlattenedRacesResult,
  ItemGroupMemberRef,
  SourceDate,
  SourceDateKind,
} from '$lib/engine/blocklist';
import type { SourceSummary, SourceTypeCount } from './content-index-service';

export interface PendingParentLink {
  parentProp: string;
  parentHash: string;
  childProp: string;
  childHash: string;
}

export interface PendingItemGroup {
  parentHash: string;
  members: ItemGroupMemberRef[];
}

export interface Accumulator {
  /** lowercased source → prop → entities */
  bySource: Map<string, Map<string, IndexedEntity[]>>;
  /** prop → hash → entity (first wins, mirroring 5etools' first-load-wins) */
  byPropHash: Map<string, Map<string, IndexedEntity>>;
  /** lowercased source → display title */
  fullNames: Map<string, string>;
  /**
   * Sources whose title came from a brew's own `_meta.sources[].full`. That
   * declaration is authoritative and must survive `recordTitles`, which would
   * otherwise overwrite it with the name of the last `adventure`/`book` record
   * in the file. For a single-adventure brew the two agree; for a collection
   * (Heliana's Guide, One Shot Wonders, Humblewood) the adventure name is one
   * chapter of many, and the source would display as e.g. "Polyhedrooze".
   */
  declaredNames: Set<string>;
  homebrewSources: Set<string>;
  /** Subset of homebrewSources that came from the partnered repo. */
  partneredSources: Set<string>;
  /**
   * Subset of homebrewSources pulled in by a local brew's
   * `_meta.dependencies` / `includes`, read from the homebrew repo.
   */
  dependencySources: Set<string>;
  /** original-case source label, keyed by lowercase */
  labels: Map<string, string>;
  /**
   * lowercased source → when it entered the corpus. Filled opportunistically
   * from the same files that yield titles, so it costs no extra I/O. See
   * engine/blocklist/dates.ts for which stamp wins.
   */
  dates: Map<string, SourceDate>;
  count: number;
  /**
   * Raw race/subrace records, held back until every file is read. The Races page
   * flattens subraces into synthetic "Race (Subrace)" entries and blocks those,
   * and a subrace can live in a different file from its parent — so the merge
   * can only run once the whole corpus is in. See engine/blocklist/races.ts.
   */
  rawRaces: RawRace[];
  rawSubraces: RawSubrace[];
  /** Parent → child edges deferred until the full corpus is indexed. */
  pendingParentLinks: PendingParentLink[];
  pendingItemGroups: PendingItemGroup[];
  /**
   * `source|prop|hash` already indexed. Homebrew really does ship the same
   * entity twice — Valda's Spire lists "Flares (5)" twice in one `item` array —
   * and two entities with one hash are one blocklist target: a rule for it hides
   * both, and there's no way to address them separately. So the picker shows one
   * row. Without this they'd be two rows sharing an identity, which is a crash
   * in any keyed list.
   */
  seen: Set<string>;
  /** How many entities were collapsed this way, for the diagnostics footer. */
  duplicateEntities: number;
}

export function newAccumulator(): Accumulator {
  return {
    bySource: new Map(),
    byPropHash: new Map(),
    fullNames: new Map(),
    declaredNames: new Set(),
    homebrewSources: new Set(),
    partneredSources: new Set(),
    dependencySources: new Set(),
    labels: new Map(),
    dates: new Map(),
    count: 0,
    rawRaces: [],
    rawSubraces: [],
    pendingParentLinks: [],
    pendingItemGroups: [],
    seen: new Set(),
    duplicateEntities: 0,
  };
}

function addEntity(
  acc: Accumulator,
  prop: string,
  raw: Record<string, unknown>,
): IndexedEntity | null {
  const source = entitySource(raw);
  if (!source) return null;
  const name =
    typeof raw.name === 'string'
      ? raw.name
      : typeof raw.id === 'string'
        ? raw.id
        : '';
  if (!name) return null;

  const hash = entityHash(prop, raw);
  if (!hash) return null;

  const key = source.toLowerCase();
  const entry: IndexedEntity = { prop, source, hash, name };

  if (!acc.labels.has(key)) acc.labels.set(key, source);

  // One hash, one row. See Accumulator.seen.
  const identity = `${key}|${prop}|${hash}`;
  if (acc.seen.has(identity)) {
    acc.duplicateEntities++;
    return null;
  }
  acc.seen.add(identity);

  let byProp = acc.bySource.get(key);
  if (!byProp) {
    byProp = new Map();
    acc.bySource.set(key, byProp);
  }
  const list = byProp.get(prop);
  if (list) list.push(entry);
  else byProp.set(prop, [entry]);

  let hashes = acc.byPropHash.get(prop);
  if (!hashes) {
    hashes = new Map();
    acc.byPropHash.set(prop, hashes);
  }
  if (!hashes.has(hash)) hashes.set(hash, entry);

  acc.count++;
  return entry;
}

/** Pull blockable props out of one parsed file. */
export function ingestFile(
  acc: Accumulator,
  json: Record<string, unknown>,
): void {
  for (const [prop, value] of Object.entries(json)) {
    if (!Array.isArray(value) || !isBlockableProp(prop)) continue;

    // Races are deferred: their blocklist identity is the flattened
    // "Race (Subrace)" form, which needs the whole corpus first.
    if (prop === 'race') {
      acc.rawRaces.push(...(value as RawRace[]));
      continue;
    }
    if (prop === 'subrace') acc.rawSubraces.push(...(value as RawSubrace[]));

    for (const raw of value) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const rec = raw as Record<string, unknown>;
        const added = addEntity(acc, prop, rec);
        if (!added) continue;

        for (const link of extractParentLinks(prop, rec)) {
          acc.pendingParentLinks.push({
            parentProp: link.parentProp,
            parentHash: link.parentHash,
            childProp: added.prop,
            childHash: added.hash,
          });
        }
        const members = extractItemGroupMembers(prop, rec);
        if (members.length) {
          acc.pendingItemGroups.push({
            parentHash: added.hash,
            members,
          });
        }
      }
    }
  }
}

/**
 * Index the flattened race list once every file is in. Note `subrace` records
 * are ALSO indexed under their own prop above: 5etools checks both a merged
 * race's `race` hash and its `subrace` hash, so both must be addressable.
 */
export function ingestRaces(acc: Accumulator): FlattenedRacesResult {
  const result = flattenRacesWithParents(acc.rawRaces, acc.rawSubraces);
  for (const flat of result.races) {
    addEntity(acc, 'race', flat);
  }
  return result;
}

/**
 * Source titles. Official abbreviations have no machine-readable full-name table
 * in `data/` (5etools keeps it in `parser.js`), so we recover what we can from
 * `books.json` / `adventures.json` and let homebrew declare its own via `_meta`.
 * Anything else displays as its abbreviation, which is what the blocklist file
 * stores anyway.
 */
export function recordTitles(
  acc: Accumulator,
  json: Record<string, unknown>,
): void {
  for (const prop of ['book', 'adventure']) {
    const arr = json[prop];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const rec = raw as {
        source?: unknown;
        name?: unknown;
        published?: unknown;
      };
      if (typeof rec.source !== 'string') continue;
      const key = rec.source.toLowerCase();
      if (typeof rec.name === 'string' && !acc.declaredNames.has(key))
        acc.fullNames.set(key, rec.name);
      // The only date official material offers. See engine/blocklist/dates.ts.
      noteDate(acc, key, parsePublishedDate(rec.published), 'published');
    }
  }
}

/** Record a candidate date for a source, if there is one to record. */
function noteDate(
  acc: Accumulator,
  key: string,
  at: number | null,
  kind: SourceDateKind,
): void {
  if (at === null) return;
  acc.dates.set(key, preferDate(acc.dates.get(key), { at, kind }));
}

/** Record a brew file's declared sources; returns their lowercased keys. */
export function recordHomebrewMeta(
  acc: Accumulator,
  json: Record<string, unknown>,
): string[] {
  const meta = json._meta as
    { sources?: unknown; dateAdded?: unknown } | undefined;
  if (!Array.isArray(meta?.sources)) return [];
  const keys: string[] = [];
  // One stamp per FILE, applied to every source the file declares — `dateAdded`
  // sits on `_meta`, not on the individual source records.
  const added = parseBrewDateAdded(meta.dateAdded);
  for (const raw of meta.sources) {
    const rec = raw as {
      json?: unknown;
      abbreviation?: unknown;
      full?: unknown;
    };
    const abbr =
      typeof rec.json === 'string'
        ? rec.json
        : typeof rec.abbreviation === 'string'
          ? rec.abbreviation
          : null;
    if (!abbr) continue;
    const key = abbr.toLowerCase();
    acc.homebrewSources.add(key);
    // Trimmed: brews are hand-authored and a stray leading space in `full`
    // (Steinhardt's Player Pack has one) would indent the row and mis-sort it.
    const full = typeof rec.full === 'string' ? rec.full.trim() : '';
    if (full) {
      acc.fullNames.set(key, full);
      acc.declaredNames.add(key);
    }
    if (!acc.labels.has(key)) acc.labels.set(key, abbr);
    noteDate(acc, key, added, 'brew');
    keys.push(key);
  }
  return keys;
}

/** One summary row per indexed source, sorted by abbreviation. */
export function summarizeSources(acc: Accumulator): SourceSummary[] {
  const sources: SourceSummary[] = [];
  for (const [key, byProp] of acc.bySource) {
    const types: SourceTypeCount[] = [];
    let total = 0;
    for (const prop of BLOCKLIST_PROP_ORDER) {
      const list = byProp.get(prop);
      if (!list?.length) continue;
      types.push({ prop, label: BLOCKLIST_PROPS[prop], count: list.length });
      total += list.length;
    }
    // Props outside the ordered list can't occur (the allowlist gates ingest),
    // but keep the total honest if the catalog is extended mid-flight.
    const label = acc.labels.get(key) ?? key.toUpperCase();
    const dated = acc.dates.get(key);
    sources.push({
      source: label,
      full: acc.fullNames.get(key) ?? label,
      isHomebrew: acc.homebrewSources.has(key),
      isPartnered: acc.partneredSources.has(key),
      isDependency: acc.dependencySources.has(key),
      total,
      types,
      dateAdded: dated?.at ?? null,
      dateKind: dated?.kind ?? null,
    });
  }
  sources.sort((a, b) => a.source.localeCompare(b.source));
  return sources;
}
