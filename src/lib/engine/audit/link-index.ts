/**
 * engine/audit/link-index.ts — the LinkIndex that link-check.ts checks refs
 * against: which names exist under which props and sources, which sources are
 * real or homebrew, and which legacy entities were reprinted. Also indexes the
 * specific magic-item variants 5etools generates at load time
 * ("+1 Longsword"). The server builds the official + brew index (see
 * services/link-service); buildLocalIndex covers the file being edited.
 */
import type { Entity } from '../types.ts';
import { asStr } from './link-extract.ts';

// --- the index -------------------------------------------------------------------

export interface LinkIndex {
  /** prop → lowercased names present (any source). */
  byProp: Map<string, Set<string>>;
  /** prop → lowercased "name|source" pairs present. */
  byPropSource: Map<string, Set<string>>;
  /** Every source abbreviation we consider real (lowercased). */
  knownSources: Set<string>;
  /** Sources defined by homebrew files — full coverage, so missing ⇒ broken. */
  homebrewSources: Set<string>;
  /** Props with full official coverage (missing unsourced name ⇒ suspicious). */
  officialProps: Set<string>;
  /** prop → lowercased name → the sources (original casing) it exists in. */
  sourcesByName: Map<string, Map<string, Set<string>>>;
  /** prop → lowercased "name|source" → `reprintedAs` uid ("Name|SRC"). */
  reprints: Map<string, Map<string, string>>;
  /** Lowercased source → edition ("classic" | "one"), from sources-5etools.json. */
  sourceEdition: Map<string, 'classic' | 'one'>;
}

export function createLinkIndex(): LinkIndex {
  return {
    byProp: new Map(),
    byPropSource: new Map(),
    knownSources: new Set(BUILTIN_OFFICIAL_SOURCES),
    homebrewSources: new Set(),
    officialProps: new Set(),
    sourcesByName: new Map(),
    reprints: new Map(),
    sourceEdition: new Map(),
  };
}

/**
 * Register the site's classic/modern source lists (the brew schema's
 * `sources-5etools.json` → `$defs.sourcesClassic` / `sourcesModern`).
 */
export function indexSourceEditions(index: LinkIndex, schema: unknown): void {
  const defs = (schema as { $defs?: Record<string, { enum?: unknown[] }> })
    ?.$defs;
  const add = (key: string, ed: 'classic' | 'one'): void => {
    for (const s of defs?.[key]?.enum ?? [])
      if (typeof s === 'string') index.sourceEdition.set(s.toLowerCase(), ed);
  };
  add('sourcesClassic', 'classic');
  add('sourcesModern', 'one');
}

/** First `reprintedAs` uid of an entity ("Name|SRC"), if any. */
function reprintOf(entity: Record<string, unknown>): string | null {
  const r = entity.reprintedAs;
  if (!Array.isArray(r) || !r.length) return null;
  const first = r[0] as unknown;
  if (typeof first === 'string') return first;
  const uid = (first as { uid?: unknown })?.uid;
  return typeof uid === 'string' ? uid : null;
}

/** Add one entity's identity (name/source — plus abbreviation for property-likes). */
export function indexEntity(
  index: LinkIndex,
  prop: string,
  entity: Entity,
): void {
  const names: string[] = [];
  const name = asStr(entity.name);
  if (name) names.push(name);
  const abbrev = asStr((entity as Record<string, unknown>).abbreviation);
  if (abbrev) names.push(abbrev); // itemProperty/itemType key by abbreviation
  const shortName = asStr((entity as Record<string, unknown>).shortName);
  if (shortName && (prop === 'subclass' || prop === 'subclassFluff'))
    names.push(shortName); // subclassFeature/@subclass refs key by shortName, not name
  // Generic variants expose their display identity via inherits.
  const inh = (entity as Record<string, unknown>).inherits as
    Record<string, unknown> | undefined;
  const source = asStr(entity.source) ?? (inh ? asStr(inh.source) : null);
  if (!names.length) return;

  let byName = index.byProp.get(prop);
  if (!byName) index.byProp.set(prop, (byName = new Set()));
  let bySrc = index.byPropSource.get(prop);
  if (!bySrc) index.byPropSource.set(prop, (bySrc = new Set()));
  let srcsOf = index.sourcesByName.get(prop);
  if (!srcsOf) index.sourcesByName.set(prop, (srcsOf = new Map()));
  const reprint = source ? reprintOf(entity as Record<string, unknown>) : null;
  for (const n of names) {
    const lc = n.toLowerCase();
    byName.add(lc);
    if (!source) continue;
    bySrc.add(`${lc}|${source.toLowerCase()}`);
    let set = srcsOf.get(lc);
    if (!set) srcsOf.set(lc, (set = new Set()));
    set.add(source);
    if (reprint) {
      let rp = index.reprints.get(prop);
      if (!rp) index.reprints.set(prop, (rp = new Map()));
      rp.set(`${lc}|${source.toLowerCase()}`, reprint);
    }
  }
  if (source) index.knownSources.add(source.toLowerCase());
}

/** Register a homebrew file's `_meta.sources[].json` ids as known homebrew sources. */
export function indexHomebrewMeta(index: LinkIndex, meta: unknown): void {
  const sources = (meta as Record<string, unknown> | undefined)?.sources;
  if (!Array.isArray(sources)) return;
  for (const s of sources) {
    const id = asStr((s as Record<string, unknown>)?.json);
    if (id) {
      index.knownSources.add(id.toLowerCase());
      index.homebrewSources.add(id.toLowerCase());
    }
  }
}

// --- generated magic-item variants --------------------------------------------
// 5etools never stores "+1 Longsword": it builds every base item × generic
// variant pair at load time (render.js Renderer.item._createSpecificVariants).
// Links like {@item +1 longsword} target those, so the index needs them too.
// Only the identity (name + source) is reproduced here, with the same rules.

type Rec = Record<string, unknown>;

function matchesValue(
  candidate: unknown,
  req: unknown,
  isEvery: boolean,
): boolean {
  if (Array.isArray(req))
    return Array.isArray(candidate)
      ? candidate.some((c) => req.includes(c))
      : req.includes(candidate);
  if (req != null && typeof req === 'object')
    return matchesAll(candidate, req as Rec, isEvery);
  return Array.isArray(candidate)
    ? candidate.some((c) => c === req)
    : candidate === req;
}

// isEvery: every key must match (requires); otherwise any key (excludes).
function matchesAll(candidate: unknown, reqs: Rec, isEvery: boolean): boolean {
  if (candidate == null || typeof candidate !== 'object') return false;
  for (const key of Object.keys(reqs)) {
    const hit = matchesValue((candidate as Rec)[key], reqs[key], isEvery);
    if (isEvery && !hit) return false;
    if (!isEvery && hit) return true;
  }
  return isEvery;
}

// 2014 bases take 2014 variants and 2024 bases take 2024 ones; unmarked
// bases take both (render.js _createSpecificVariants_isEditionMatch).
function editionMatches(base: Rec, variant: Rec): boolean {
  if (base.edition === variant.edition) return true;
  if (base.edition == null) return true;
  if (base.edition === 'classic') return false;
  if (base.edition === 'one') return variant.edition !== 'classic';
  return false;
}

/** The name and source 5etools gives one base item × generic variant pair. */
function specificVariantId(
  base: Rec,
  variant: Rec,
): { name: string; source: string } | null {
  const inh = variant.inherits as Rec | undefined;
  if (!inh || !Array.isArray(variant.requires)) return null;
  if (base.packContents || !editionMatches(base, variant)) return null;
  if (
    !variant.requires.some(
      (r) => r && typeof r === 'object' && matchesAll(base, r as Rec, true),
    )
  )
    return null;
  if (
    variant.excludes &&
    typeof variant.excludes === 'object' &&
    matchesAll(base, variant.excludes as Rec, false)
  )
    return null;

  let name = String(base.name ?? '');
  // "Remove" keys apply first, as in 5etools.
  const keys = Object.keys(inh).sort(
    (a, b) => Number(b.includes('Remove')) - Number(a.includes('Remove')),
  );
  for (const k of keys) {
    const v = inh[k];
    if (typeof v !== 'string') continue;
    if (k === 'nameRemove') name = name.split(v).join('');
    else if (k === 'namePrefix') name = `${v}${name}`;
    else if (k === 'nameSuffix') name = `${name}${v}`;
  }
  const source = asStr(inh.source) ?? asStr(base.source);
  return name && source ? { name, source } : null;
}

/** Index every specific variant (e.g. "+1 Longsword|DMG") under `item`. */
export function indexSpecificVariants(
  index: LinkIndex,
  baseItems: Entity[],
  variants: Entity[],
): void {
  for (const base of baseItems) {
    if (!base || typeof base !== 'object') continue;
    for (const variant of variants) {
      if (!variant || typeof variant !== 'object') continue;
      const id = specificVariantId(base as Rec, variant as Rec);
      if (id) indexEntity(index, 'item', id as Entity);
    }
  }
}

/**
 * Official source abbreviations that never appear in the data we index (or that
 * we may not load at all). Keeps "unknown source" warnings honest without
 * loading every official file. Lowercased.
 */
export const BUILTIN_OFFICIAL_SOURCES: string[] = [
  'phb',
  'dmg',
  'mm',
  'xphb',
  'xdmg',
  'xmm',
  'tce',
  'xge',
  'vgm',
  'mtf',
  'mpmm',
  'scag',
  'erlw',
  'egw',
  'ai',
  'ftd',
  'bam',
  'scc',
  'vrgr',
  'idrotf',
  'wbtw',
  'cos',
  'lmop',
  'pota',
  'oota',
  'skt',
  'tftyp',
  'toa',
  'wdh',
  'wdmm',
  'gos',
  'bgdia',
  'sdw',
  'slw',
  'sads',
  'dip',
  'rmbre',
  'sac',
  'mot',
  'tob',
  'ggr',
  'bmt',
  'sato',
  'paitm',
  'hat-tg',
  'mcv1sc',
  'mcv2dc',
  'mcv3mc',
  'mcv4ec',
  'dsotdq',
  'kftgv',
  'pabtso',
  'dodk',
  'ua',
  'psa',
  'psi',
  'psk',
  'psx',
  'psz',
];

/** Build a local overlay index from the file's own content (self-refs resolve). */
export function buildLocalIndex(doc: Record<string, unknown>): LinkIndex {
  const local = createLinkIndex();
  local.knownSources.clear(); // overlay adds only what THIS file defines
  indexHomebrewMeta(local, doc._meta);
  for (const [key, val] of Object.entries(doc)) {
    if (!Array.isArray(val)) continue;
    for (const entity of val as Entity[]) {
      if (entity && typeof entity === 'object') indexEntity(local, key, entity);
    }
  }
  return local;
}
