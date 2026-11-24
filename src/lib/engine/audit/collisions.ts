/**
 * engine/audit/collisions.ts — find identities that silently override each
 * other across brews, official data, and the public homebrew repo.
 *
 * INTENT
 *   5etools keys content by (page, name, source) — lowercased — and a later
 *   load simply wins. Two brews defining "Flame Blade|MyBrew", a brew reusing
 *   the source id "PHB" for its own items, or two files both declaring
 *   `"json": "Drakkenheim"` all produce overrides with no error anywhere.
 *   This module finds them. Pure: the server supplies documents + indexes.
 *
 * WHAT IS CHECKED
 *   entity            same (prop, identity) in 2+ brew files      → error
 *   entity-dupe       same identity twice in ONE file              → error
 *   entity-official   a brew entity with an official identity      → error
 *   source-official   `_meta.sources[].json` is an official source → error
 *   source-duplicate  same source json (case-insensitive) in 2+ files → warning
 *                     (overrides only bite on same-named entities, which
 *                     `entity` reports; the repo's cleaner rejects it outright)
 *   source-repo       json matches a DIFFERENT published repo brew  → warning
 *   abbreviation      display abbreviation shared / official        → warning
 *
 * IDENTITY
 *   engine/merge getEntityKey — the same type-aware key `_copy` uses (class
 *   features include class/level/subclass) — plus any parent coordinates the
 *   entity carries (raceName, monsterName, …). book/adventure(+Data) key by `id`.
 */
import type { Entity } from '../types.ts';
import { getEntityKey } from '../merge/copy.ts';
import type { SiteSources } from './site-sources.ts';

export type CollisionKind =
  | 'entity'
  | 'entity-dupe'
  | 'entity-official'
  | 'source-official'
  | 'source-duplicate'
  | 'source-repo'
  | 'abbreviation';

export interface Collision {
  kind: CollisionKind;
  severity: 'error' | 'warning';
  /** Plain-text explanation. */
  message: string;
  /** Local brew files involved. */
  files: string[];
  prop?: string;
  name?: string;
  source?: string;
}

export interface CollisionInput {
  files: { file: string; doc: Record<string, unknown> }[];
  /** prop → identity keys present in official data. */
  officialKeys?: Map<string, Set<string>>;
  site: SiteSources;
  /** Homebrew repo `_generated/index-sources.json`: source json → repo path. */
  repoSources?: Record<string, string>;
}

export interface CollisionReport {
  collisions: Collision[];
  totals: { errors: number; warnings: number; files: number };
}

const SKIP_KEYS = new Set(['_meta', '$schema', '_test', 'siteVersion']);
const ID_PROPS = new Set(['book', 'bookData', 'adventure', 'adventureData']);

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null;

const entitySource = (e: Obj): string | null =>
  str(e.source) ?? str((e.inherits as Obj | undefined)?.source);

/** Identity key for collision purposes (null when the entity has none). */
export function collisionKey(prop: string, e: Obj): string | null {
  if (ID_PROPS.has(prop)) {
    const id = str(e.id);
    return id ? `id:${id.toLowerCase()}` : null;
  }
  const name = str(e.name);
  const source = entitySource(e);
  if (!name || !source) return null;
  // Parent coordinates that are part of the site's hash for child types
  // (subrace → race, foundry* sidecars → monster/class/…): "Arctic" under two
  // different races is two entities, not a collision.
  const coords = PARENT_COORDS.map((k) => e[k])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v).toLowerCase());
  const base = getEntityKey({ ...e, source }, prop);
  return coords.length ? `${base}__${coords.join('__')}` : base;
}

const PARENT_COORDS = [
  'raceName',
  'raceSource',
  'monsterName',
  'monsterSource',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
];

const basename = (p: string): string =>
  p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1);

export function findCollisions(input: CollisionInput): CollisionReport {
  const out: Collision[] = [];

  // --- entity identities -------------------------------------------------------
  // prop|key → [{file, name, source}]
  const seen = new Map<
    string,
    { file: string; name: string; source: string }[]
  >();
  for (const { file, doc } of input.files) {
    for (const [prop, arr] of Object.entries(doc)) {
      if (SKIP_KEYS.has(prop) || !Array.isArray(arr)) continue;
      for (const raw of arr) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as Obj;
        const key = collisionKey(prop, e);
        if (!key) continue;
        const k = `${prop}|${key}`;
        const list = seen.get(k) ?? [];
        list.push({
          file,
          name: String(e.name ?? e.id ?? ''),
          source: String(entitySource(e) ?? ''),
        });
        seen.set(k, list);
      }
    }
  }

  for (const [k, list] of seen) {
    const prop = k.slice(0, k.indexOf('|'));
    const key = k.slice(k.indexOf('|') + 1);
    const { name, source } = list[0];
    const files = [...new Set(list.map((l) => l.file))];
    const label = `${prop} "${name}" (${source})`;

    if (input.officialKeys?.get(prop)?.has(key)) {
      out.push({
        kind: 'entity-official',
        severity: 'error',
        message: `${label} has the same identity as official content — the brew version silently replaces it. Give it a homebrew source.`,
        files,
        prop,
        name,
        source,
      });
    }
    if (files.length > 1) {
      out.push({
        kind: 'entity',
        severity: 'error',
        message: `${label} is defined in ${files.length} files — whichever loads last wins.`,
        files,
        prop,
        name,
        source,
      });
    } else if (list.length > 1) {
      out.push({
        kind: 'entity-dupe',
        severity: 'error',
        message: `${label} is defined ${list.length} times in the same file.`,
        files,
        prop,
        name,
        source,
      });
    }
  }

  // --- source ids + abbreviations ----------------------------------------------------
  const byJson = new Map<string, { file: string; json: string }[]>();
  const byAbbr = new Map<string, { file: string; abbr: string }[]>();
  for (const { file, doc } of input.files) {
    const sources = (doc._meta as Obj | undefined)?.sources;
    if (!Array.isArray(sources)) continue;
    for (const s of sources as Obj[]) {
      const json = str(s?.json);
      if (json) {
        const l = byJson.get(json.toLowerCase()) ?? [];
        l.push({ file, json });
        byJson.set(json.toLowerCase(), l);
      }
      const abbr = str(s?.abbreviation);
      if (abbr) {
        const l = byAbbr.get(abbr.toLowerCase()) ?? [];
        l.push({ file, abbr });
        byAbbr.set(abbr.toLowerCase(), l);
      }
    }
  }

  const repoByLc = new Map(
    Object.entries(input.repoSources ?? {}).map(([k, v]) => [
      k.toLowerCase(),
      { code: k, path: v },
    ]),
  );

  for (const [lc, list] of byJson) {
    const files = [...new Set(list.map((l) => l.file))];
    const json = list[0].json;
    if (input.site.official.has(lc)) {
      out.push({
        kind: 'source-official',
        severity: 'error',
        message: `source "${json}" is an official 5etools source (${input.site.canonical.get(lc) ?? json.toUpperCase()}) — every entity under it collides with official content.`,
        files,
        source: json,
      });
    }
    if (files.length > 1) {
      const spellings = [...new Set(list.map((l) => l.json))];
      out.push({
        kind: 'source-duplicate',
        severity: 'warning',
        message: `source "${json}" is declared by ${files.length} files${spellings.length > 1 ? ` (as ${spellings.map((s) => `"${s}"`).join(', ')} — sources compare case-insensitively)` : ''}; the site keeps one set of source metadata, same-named entities under it override each other, and the homebrew repo rejects the second file.`,
        files,
        source: json,
      });
    }
    const repo = repoByLc.get(lc);
    if (repo) {
      const others = files.filter((f) => basename(f) !== basename(repo.path));
      if (others.length) {
        out.push({
          kind: 'source-repo',
          severity: 'warning',
          message: `source "${json}" is already used by "${repo.path}" in the homebrew repo — anyone loading both gets silent overrides.`,
          files: others,
          source: json,
        });
      }
    }
  }

  for (const [lc, list] of byAbbr) {
    const files = [...new Set(list.map((l) => l.file))];
    const abbr = list[0].abbr;
    if (input.site.official.has(lc)) {
      out.push({
        kind: 'abbreviation',
        severity: 'warning',
        message: `abbreviation "${abbr}" is also an official source's abbreviation — lists and filters will show two indistinguishable sources.`,
        files,
        source: abbr,
      });
    } else if (files.length > 1) {
      out.push({
        kind: 'abbreviation',
        severity: 'warning',
        message: `abbreviation "${abbr}" is shared by ${files.length} files — they can't be told apart in source filters.`,
        files,
        source: abbr,
      });
    }
  }

  const order: Record<CollisionKind, number> = {
    'source-official': 0,
    'source-duplicate': 1,
    'entity-official': 2,
    entity: 3,
    'entity-dupe': 4,
    'source-repo': 5,
    abbreviation: 6,
  };
  out.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      order[a.kind] - order[b.kind] ||
      a.message.localeCompare(b.message),
  );
  return {
    collisions: out,
    totals: {
      errors: out.filter((c) => c.severity === 'error').length,
      warnings: out.filter((c) => c.severity === 'warning').length,
      files: input.files.length,
    },
  };
}

/** Collisions touching one file (for per-file views). */
export const collisionsForFile = (
  report: CollisionReport,
  file: string,
): Collision[] => report.collisions.filter((c) => c.files.includes(file));

/** Build official identity keys from loaded official arrays. */
export function buildOfficialKeys(
  byProp: Record<string, Entity[]>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [prop, list] of Object.entries(byProp)) {
    const set = new Set<string>();
    for (const e of list) {
      const k = collisionKey(prop, e as Obj);
      if (k) set.add(k);
    }
    out.set(prop, set);
  }
  return out;
}
