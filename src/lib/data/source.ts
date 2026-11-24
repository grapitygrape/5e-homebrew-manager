/**
 * data/source.ts — DataSource interface, official 5etools file map, and merge helpers.
 */
import type { Entity, BlocklistLookup } from '../engine/types.ts';
import type { SchemaMap } from '../engine/audit/index.ts';
import { mergeEntities, buildBlocklistLookup } from '../engine/merge/index.ts';
import { normalizeVariantItem } from '../engine/item-list.ts';
import { mapPool } from '../util.ts';
import type { PartneredFileMeta, RepoFileMeta } from './partnered.ts';

/** Bookkeeping JSON files in a homebrew folder that are never brews. */
export const IGNORED_HOMEBREW: ReadonlySet<string> = new Set([
  'index.json',
  'content-blocklist.json',
]);

/** A configurable location: a filesystem path (Node) OR a base URL (anywhere). */
export interface SourceRef {
  path?: string;
  url?: string;
}

/** Where each kind of content lives. Any source may be a path or a URL. */
export interface DataSourceConfig {
  /** 5etools `data/` dir: items.json, spells/, class/, races.json, … */
  data: SourceRef;
  /** Brew JSON-Schema root (data-utils/schema/brew). */
  schema: SourceRef;
  /** Folder of conversion-guide markdown. */
  guides: SourceRef;
  /** Folder of homebrew `.json` files (top level only). */
  homebrew: SourceRef;
  /**
   * Optional checkout of a 5etools homebrew repo (TheGiddyLimit/homebrew).
   * Only its *partnered* brews are read, and only to widen the content index —
   * nothing is copied into `homebrew`. Unset means "no partnered content".
   * Path only: the
   * selection is driven by the repo's `_generated` indexes, so a URL ref would
   * need a manifest that repo doesn't publish.
   */
  partnered?: SourceRef;
}

/**
 * How a source looks, as 5etools shows it: a brew's `_meta.sources[]` record,
 * or an official book's entry in the site's parser.js and main.css.
 */
export interface SourceDisplay {
  /** The id entities cite (`SpellsThatDontSuck`, `XPHB`). */
  json: string;
  /** The prefix people read (`SDS`, `PHB'24`); the json id when none is declared. */
  abbreviation: string;
  /** CSS colour from `colorNight`, else `color` (e.g. `#9661ab`); '' if neither. */
  color: string;
}

export interface HomebrewFileMeta {
  file: string;
  /** Display name (from `_meta.sources[0].full`) or the filename. */
  name: string;
  size: number;
  /** Entity-array counts, e.g. `{ item: 12, spell: 3 }`. */
  counts: Record<string, number>;
  /** Parse error message, if the file is invalid JSON. */
  error: string | null;
  /** Authors from `_meta.sources[0].authors`, joined. */
  authors: string;
  /** The file's `_meta.sources`, in order; the first is the brew's own. */
  sources: SourceDisplay[];
  /** File mtime in ms; 0 if unknown (HTTP listings). */
  mtime: number;
  /** `_meta.dateLastModified` (Unix seconds); 0 when the file has none. */
  dateLastModified: number;
}

export interface HomebrewListing {
  path: string;
  exists: boolean;
  files: HomebrewFileMeta[];
}

/** One homebrew file's metadata paired with its cached parsed JSON (null on parse error). */
export interface HomebrewDocument {
  file: string;
  meta: HomebrewFileMeta;
  doc: Record<string, unknown> | null;
}

/** Every homebrew file in the working folder with both metadata and parsed JSON. */
export interface HomebrewCorpus {
  path: string;
  exists: boolean;
  files: HomebrewDocument[];
}

/** Every partnered brew a configured repo offers (empty when unconfigured). */
export interface PartneredListing {
  path: string;
  exists: boolean;
  files: PartneredFileMeta[];
  /**
   * The repo's whole `index-sources.json` (source code -> repo-relative path),
   * partnered or not. Resolves `_meta.dependencies`; `{}` when unconfigured.
   */
  sourcePaths: Record<string, string>;
  /** Full names and abbreviations from `_generated/index-meta.json`, keyed by basename. */
  metaByFile: Record<string, RepoFileMeta>;
}

/** The contract every adapter satisfies. All methods are async (I/O may be remote). */
export interface DataSource {
  readonly kind: 'fs';
  /** Official records for a 5etools array key (item, spell, subclassFeature, …). */
  getOfficial(arrayProp: string): Promise<Entity[]>;
  /** Homebrew records for an array key, grouped by source file. */
  getHomebrew(
    arrayProp: string,
  ): Promise<{ file: string; entities: Entity[] }[]>;
  /** Metadata for every homebrew file (no entity bodies). */
  listHomebrew(): Promise<HomebrewListing>;
  /** Every homebrew file's metadata and cached parsed JSON (null on parse error). */
  getHomebrewCorpus(): Promise<HomebrewCorpus>;
  readHomebrew(file: string): Promise<Record<string, unknown>>;
  /**
   * Partnered brews available from the configured homebrew-repo checkout, with
   * the source codes each declares — enough for a caller to skip one it already
   * has without paying to parse it. Empty when no repo is configured, or when
   * the adapter can't enumerate a folder.
   */
  listPartnered(): Promise<PartneredListing>;
  /** One partnered brew by its repo-relative path. */
  readPartnered(relPath: string): Promise<Record<string, unknown> | null>;
  /** Parsed content-blocklist lookup (empty when absent). */
  getBlocklist(): Promise<BlocklistLookup>;
  /**
   * The raw `content-blocklist.json`, or null when absent. The Blocklist
   * Manager needs the entries themselves (displayName, isAuto, the envelope),
   * not the merge-time lookup `getBlocklist()` reduces them to.
   */
  readBlocklistFile(): Promise<Record<string, unknown> | null>;
  /** Overwrite `content-blocklist.json`. `backup` rotates the previous copy to `.bak`. */
  writeBlocklistFile(
    json: Record<string, unknown>,
    opts?: { backup?: boolean },
  ): Promise<void>;
  /**
   * Every JSON file under the data root, as paths relative to it (`items.json`,
   * `bestiary/bestiary-mm.json`). Needed because the blocklist spans far more
   * content types than OFFICIAL_SOURCES wires up; a scan is the only way to see
   * them all. Adapters that can't enumerate a folder should throw.
   */
  listDataFiles(): Promise<string[]>;
  /** One data file by relative path (null when missing or unparseable). */
  readDataFile(relPath: string): Promise<Record<string, unknown> | null>;
  /** Batch data file read preserving order (null for missing or unparseable files). */
  readDataFiles(
    relPaths: readonly string[],
  ): Promise<(Record<string, unknown> | null)[]>;
  /**
   * A text file from the 5etools site root, the data folder's parent
   * (`js/parser.js`, `css/main.css`). Null when missing or unreachable.
   */
  readSiteFile(relPath: string): Promise<string | null>;
  /** All brew schema files keyed by path relative to the schema root. */
  getSchemas(): Promise<SchemaMap>;
  /** Conversion-guide markdown by filename. */
  getGuide(file: string): Promise<string>;
  listGuides(): Promise<string[]>;
}

// --- declarative official-source map ---------------------------------------
// Describes how to assemble each array key from the 5etools `data/` dir, so an
// adapter only needs a `readJson(relPath)` primitive (plus indexed dirs).

export type OfficialSpec =
  | { kind: 'file'; file: string; prop: string }
  | { kind: 'files'; files: string[]; prop: string }
  | { kind: 'indexed'; index: string; prop: string };

export const OFFICIAL_SOURCES: Record<string, OfficialSpec> = {
  item: { kind: 'file', file: 'items.json', prop: 'item' },
  itemGroup: { kind: 'file', file: 'items.json', prop: 'itemGroup' },
  baseitem: { kind: 'file', file: 'items-base.json', prop: 'baseitem' },
  // NOTE: the file is `magicvariants.json` (plural). Singular silently yields an
  // empty array, which drops all ~214 official generic variants (+1 Weapon, …)
  // from the item catalog — they then fail to resolve in shop lists.
  magicvariant: {
    kind: 'file',
    file: 'magicvariants.json',
    prop: 'magicvariant',
  },
  feat: { kind: 'file', file: 'feats.json', prop: 'feat' },
  background: { kind: 'file', file: 'backgrounds.json', prop: 'background' },
  race: { kind: 'file', file: 'races.json', prop: 'race' },
  subrace: { kind: 'file', file: 'races.json', prop: 'subrace' },
  optionalfeature: {
    kind: 'file',
    file: 'optionalfeatures.json',
    prop: 'optionalfeature',
  },
  action: { kind: 'file', file: 'actions.json', prop: 'action' },
  condition: {
    kind: 'file',
    file: 'conditionsdiseases.json',
    prop: 'condition',
  },
  status: { kind: 'file', file: 'conditionsdiseases.json', prop: 'status' },
  spell: { kind: 'indexed', index: 'spells/index.json', prop: 'spell' },
  // Creatures are the heaviest `_copy`/`_templates` users; the resolved
  // preview and the collision checker need them, and `{@creature}` links get
  // full official coverage.
  monster: { kind: 'indexed', index: 'bestiary/index.json', prop: 'monster' },
  legendaryGroup: {
    kind: 'file',
    file: 'bestiary/legendarygroups.json',
    prop: 'legendaryGroup',
  },
  class: { kind: 'indexed', index: 'class/index.json', prop: 'class' },
  subclass: { kind: 'indexed', index: 'class/index.json', prop: 'subclass' },
  classFeature: {
    kind: 'indexed',
    index: 'class/index.json',
    prop: 'classFeature',
  },
  subclassFeature: {
    kind: 'indexed',
    index: 'class/index.json',
    prop: 'subclassFeature',
  },
  // Most book tables (e.g. Indefinite Madness, DMG) only exist in the
  // generated file; 5etools' tables page loads both.
  table: {
    kind: 'files',
    files: ['tables.json', 'generated/gendata-tables.json'],
    prop: 'table',
  },
};

/** Blocklist category per array key; unlisted keys use the key itself. */
export const BLOCKLIST_CATEGORY: Record<string, string> = {
  itemGroup: 'item',
  subrace: 'race',
  optionalfeature: 'feat',
  subclass: 'class',
  classFeature: 'classFeature',
  subclassFeature: 'classFeature',
};

export const blocklistCategoryFor = (arrayProp: string): string =>
  BLOCKLIST_CATEGORY[arrayProp] ?? arrayProp;

const officialSourceKey = (spec: OfficialSpec): string =>
  spec.kind === 'file'
    ? `file:${spec.file}`
    : spec.kind === 'files'
      ? `files:${spec.files.join('|')}`
      : `indexed:${spec.index}`;

/** All OFFICIAL_SOURCES keys that read from the same file(s) as `arrayProp`. */
export function officialSiblingsFor(arrayProp: string): string[] {
  const spec = OFFICIAL_SOURCES[arrayProp];
  if (!spec) return [];
  const key = officialSourceKey(spec);
  return Object.entries(OFFICIAL_SOURCES)
    .filter(([, candidate]) => officialSourceKey(candidate) === key)
    .map(([name]) => name);
}

/**
 * Load one or more entity arrays sharing the same OfficialSpec in a single read pass.
 * Avoids re-parsing shared files (`items.json`, `races.json`, `class/*.json`) per prop.
 */
export async function loadOfficialProps(
  spec: OfficialSpec,
  props: readonly string[],
  readJson: (relPath: string) => Promise<Record<string, unknown> | null>,
): Promise<Record<string, Entity[]>> {
  const out: Record<string, Entity[]> = Object.fromEntries(
    props.map((p) => [p, [] as Entity[]]),
  );
  const appendFrom = (json: Record<string, unknown> | null): void => {
    if (!json) return;
    for (const prop of props) {
      const arr = json[prop];
      if (Array.isArray(arr)) out[prop].push(...(arr as Entity[]));
    }
  };

  if (spec.kind === 'file') {
    appendFrom(await readJson(spec.file));
    return out;
  }

  let relPaths: string[];
  if (spec.kind === 'files') {
    relPaths = spec.files;
  } else {
    const index = await readJson(spec.index);
    if (!index) return out;
    const dir = spec.index.includes('/')
      ? spec.index.slice(0, spec.index.lastIndexOf('/'))
      : '';
    relPaths = Object.values(index)
      .filter((f): f is string => typeof f === 'string')
      .map((f) => (dir ? `${dir}/${f}` : f));
  }

  const docs = await mapPool(relPaths, (rel) => readJson(rel));
  for (const json of docs) appendFrom(json);
  return out;
}

export async function loadOfficial(
  spec: OfficialSpec,
  readJson: (relPath: string) => Promise<Record<string, unknown> | null>,
): Promise<Entity[]> {
  return (await loadOfficialProps(spec, [spec.prop], readJson))[spec.prop];
}

/**
 * Load official + homebrew for `arrayProp` through `ds`, then run the engine's
 * merge/blocklist/_copy pipeline. The one call API routes need. `type` defaults
 * to `arrayProp` (they differ only for `_copy` identity, which keys off the
 * array key here anyway).
 */
export async function composeMerged(
  ds: DataSource,
  arrayProp: string,
  type = arrayProp,
): Promise<Entity[]> {
  const [official, homebrew, blocklist] = await Promise.all([
    ds.getOfficial(arrayProp),
    ds.getHomebrew(arrayProp),
    ds.getBlocklist(),
  ]);
  return mergeEntities({
    type,
    official,
    homebrew,
    blocklistCategory: blocklistCategoryFor(arrayProp),
    blocklist,
  });
}

// The Shop's item catalog spans three 5etools arrays: specific items, base
// items, and generic variants (Adamantine/Vorpal, homebrew like Champion's
// Weapon). Homebrew sometimes stores generic variants under `variant`.
interface CatalogPart {
  type: string;
  official: string;
  homebrew: string[];
}

const ITEM_CATALOG: CatalogPart[] = [
  { type: 'item', official: 'item', homebrew: ['item'] },
  { type: 'itemGroup', official: 'itemGroup', homebrew: ['itemGroup'] },
  { type: 'baseitem', official: 'baseitem', homebrew: ['baseitem'] },
  {
    type: 'magicvariant',
    official: 'magicvariant',
    homebrew: ['magicvariant', 'variant'],
  },
];

/**
 * Full item catalog: specific items, item groups, base items, and generic variants.
 * Generic variants are normalized (inherits → top level) before merge so the
 * blocklist sees their source and hashes match.
 */
export async function composeItemCatalog(ds: DataSource): Promise<Entity[]> {
  const [blocklist, parts] = await Promise.all([
    ds.getBlocklist(),
    Promise.all(
      ITEM_CATALOG.map(async (part) => {
        const [official, homebrewGroups] = await Promise.all([
          ds.getOfficial(part.official),
          Promise.all(part.homebrew.map((k) => ds.getHomebrew(k))),
        ]);
        return { part, official, homebrew: homebrewGroups.flat() };
      }),
    ),
  ]);

  const out: Entity[] = [];
  for (const { part, official: rawOfficial, homebrew: rawHomebrew } of parts) {
    const official =
      part.type === 'magicvariant'
        ? rawOfficial.map(normalizeVariantItem)
        : rawOfficial;
    const homebrew =
      part.type === 'magicvariant'
        ? rawHomebrew.map((g) => ({
            file: g.file,
            entities: g.entities.map(normalizeVariantItem),
          }))
        : rawHomebrew;
    out.push(
      ...mergeEntities({
        type: part.type,
        official,
        homebrew,
        blocklistCategory: blocklistCategoryFor(part.official),
        blocklist,
      }),
    );
  }
  return out;
}

/** Parse a blocklist file's JSON into a lookup (re-exported for adapters). */
export const parseBlocklist = (json: unknown): BlocklistLookup =>
  buildBlocklistLookup(json as Parameters<typeof buildBlocklistLookup>[0]);
