/**
 * lib/services/preview-service.ts — the resolved-entity preview: one entity
 * after `_copy` (+ `_mod`, `_templates`, variables) and each of its
 * `_versions`, the way the site will show it.
 *
 * INTENT
 *   merge/copy-applier is pure; this supplies what it needs and memoizes the
 *   expensive parts:
 *     - official entities a `_copy` can target, as one identity map per type,
 *     - official fluff, which the link index has no use for,
 *     - creature / legendary-group templates (data/bestiary/template.json +
 *       any homebrew `monsterTemplate` arrays).
 *   The brew corpus comes from brew-check-service's getBrewCorpus(). Every
 *   cache here is dropped by resetDataSource().
 */
import { cachedResource, getDataSource, onDataSourceReset } from './datasource';
import { getBrewCorpus } from './brew-check-service';
import { loadOfficial } from '$lib/data';
import type { OfficialSpec } from '$lib/data';
import {
  resolveCopyTraced,
  expandVersions,
  getEntityKey,
} from '$lib/engine/merge';
import type {
  CopyTrace,
  CopyChainLink,
  Template,
  ResolvedVersion,
} from '$lib/engine/merge';
import type { Entity } from '$lib/engine/types';

type Doc = Record<string, unknown>;

const fluffByProp = new Map<string, Promise<Entity[]>>();
const officialIdentityMaps = new Map<string, Promise<Record<string, Entity>>>();
onDataSourceReset(() => {
  fluffByProp.clear();
  officialIdentityMaps.clear();
});

/**
 * Official fluff, which brews `_copy` constantly ("Aboleth|MM" fluff) but the
 * link index has no use for — so it's wired here, for the preview only.
 */
const OFFICIAL_FLUFF: Record<string, OfficialSpec> = {
  monsterFluff: {
    kind: 'indexed',
    index: 'bestiary/fluff-index.json',
    prop: 'monsterFluff',
  },
  itemFluff: { kind: 'file', file: 'fluff-items.json', prop: 'itemFluff' },
  spellFluff: {
    kind: 'indexed',
    index: 'spells/fluff-index.json',
    prop: 'spellFluff',
  },
  raceFluff: { kind: 'file', file: 'fluff-races.json', prop: 'raceFluff' },
  featFluff: { kind: 'file', file: 'fluff-feats.json', prop: 'featFluff' },
  backgroundFluff: {
    kind: 'file',
    file: 'fluff-backgrounds.json',
    prop: 'backgroundFluff',
  },
  conditionFluff: {
    kind: 'file',
    file: 'fluff-conditionsdiseases.json',
    prop: 'conditionFluff',
  },
};

function getOfficialForPreview(prop: string): Promise<Entity[]> {
  const ds = getDataSource();
  const fluff = OFFICIAL_FLUFF[prop];
  if (!fluff) return ds.getOfficial(prop).catch(() => [] as Entity[]);
  let p = fluffByProp.get(prop);
  if (!p) {
    p = loadOfficial(fluff, (rel) => ds.readDataFile(rel)).catch(
      () => [] as Entity[],
    );
    fluffByProp.set(prop, p);
  }
  return p;
}

const templatesCache = cachedResource<Record<string, Template[]>>(async () => {
  const ds = getDataSource();
  const official = await ds
    .readDataFile('bestiary/template.json')
    .catch(() => null);
  const out: Record<string, Template[]> = {
    monster: [...((official?.monsterTemplate as Template[]) ?? [])],
    legendaryGroup: [
      ...((official?.legendaryGroupTemplate as Template[]) ?? []),
    ],
  };
  for (const { doc } of await getBrewCorpus()) {
    if (Array.isArray(doc.monsterTemplate))
      out.monster.push(...(doc.monsterTemplate as Template[]));
    if (Array.isArray(doc.legendaryGroupTemplate))
      out.legendaryGroup.push(...(doc.legendaryGroupTemplate as Template[]));
  }
  return out;
});

/** Props whose entities a `_copy` under `type` can target (same site page). */
const COPY_POOL: Record<string, string[]> = {
  item: ['baseitem', 'item'],
  baseitem: ['baseitem'],
  magicvariant: ['magicvariant'],
};

export interface ResolvedPreview {
  type: string;
  /** The raw entity as written. */
  raw: Entity;
  /** After `_copy` (+ `_mod`, `_templates`, variables). Equals raw when no `_copy`. */
  resolved: Entity;
  hasCopy: boolean;
  chain: CopyChainLink[];
  trace: CopyTrace;
  /** Each `_versions` entry (and monster `variant._version`), fully applied. */
  versions: ResolvedVersion[];
}

const ANNOTATIONS = ['_isHomebrew', '_homebrewFile'];
const strip = (e: Entity): Entity => {
  const out = { ...e };
  for (const k of ANNOTATIONS) delete out[k];
  return out;
};

/** `doc[type][entityIdx]`, or null when there's no such entity. */
export function entityAt(
  doc: Doc | undefined,
  type: string,
  entityIdx: unknown,
): Entity | null {
  const arr = doc?.[type];
  if (!Array.isArray(arr) || typeof entityIdx !== 'number') return null;
  return (arr[entityIdx] as Entity) ?? null;
}

function indexEntityInto(
  map: Record<string, Entity>,
  e: Entity,
  type: string,
  annotate: Partial<Entity>,
): void {
  if (!e || typeof e !== 'object') return;
  // Generic variants carry their source in `inherits` (the site hashes it).
  const inh = e.inherits as { source?: string } | undefined;
  const k = getEntityKey(
    { ...e, source: e.source ?? inh?.source } as Record<string, unknown>,
    type,
  );
  if (k) map[k] = { ...e, ...annotate };
}

function getOfficialIdentityMap(type: string): Promise<Record<string, Entity>> {
  let cached = officialIdentityMaps.get(type);
  if (!cached) {
    const pool = COPY_POOL[type] ?? [type];
    cached = Promise.all(pool.map((prop) => getOfficialForPreview(prop))).then(
      (groups) => {
        const base: Record<string, Entity> = {};
        for (const entities of groups) {
          for (const e of entities) {
            indexEntityInto(base, e, type, { _isHomebrew: false });
          }
        }
        return base;
      },
    );
    officialIdentityMaps.set(type, cached);
  }
  return cached;
}

/**
 * Resolve one entity the way the site will. `doc` (the file being edited)
 * overlays the corpus so unsaved parents resolve; `file` names it so its
 * on-disk copy doesn't shadow the edit.
 */
export async function resolvePreview(opts: {
  type: string;
  entity: Entity;
  doc?: Doc;
  file?: string;
}): Promise<ResolvedPreview> {
  const { type, entity, doc, file } = opts;
  const pool = COPY_POOL[type] ?? [type];

  const [officialBase, corpus, templates] = await Promise.all([
    getOfficialIdentityMap(type),
    getBrewCorpus(),
    templatesCache.get(),
  ]);

  // Shallow-copy the cached official map, then overlay brews and the edited doc.
  const map: Record<string, Entity> = { ...officialBase };
  for (const { file: f, doc: d } of corpus) {
    if (doc && f === file) continue;
    for (const prop of pool) {
      for (const e of (Array.isArray(d[prop]) ? d[prop] : []) as Entity[]) {
        indexEntityInto(map, e, type, { _isHomebrew: true, _homebrewFile: f });
      }
    }
  }
  if (doc) {
    for (const prop of pool) {
      for (const e of (Array.isArray(doc[prop]) ? doc[prop] : []) as Entity[]) {
        indexEntityInto(map, e, type, {
          _isHomebrew: true,
          _homebrewFile: file ?? '(this file)',
        });
      }
    }
  }

  const tpl = templates[type] ?? [];
  const traced = resolveCopyTraced(entity, map, type, { templates: tpl });
  const resolved = strip(traced.entity);
  const versions = expandVersions(resolved, { prop: type, templates: tpl }).map(
    (v) => ({ ...v, entity: strip(v.entity) }),
  );
  return {
    type,
    raw: entity,
    resolved,
    hasCopy: !!entity._copy,
    chain: traced.chain,
    trace: traced.trace,
    versions,
  };
}
