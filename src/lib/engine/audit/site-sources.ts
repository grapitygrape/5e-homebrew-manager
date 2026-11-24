/**
 * engine/audit/site-sources.ts — the site's own source lists, read from the
 * brew schema folder.
 *
 * INTENT
 *   The homebrew repo's CI decides "is this an official source?", "is this a
 *   2014 or 2024 book?" and "is this a grandfathered short source id?" from
 *   three schema files. Reading the SAME files (not a hand-kept list) keeps
 *   the collision checker and submission linter in lockstep with CI.
 *     sources-5etools.json          $defs.sources / sourcesClassic / sourcesModern
 *     sources-homebrew-legacy.json  $defs.sourcesShort / sourcesColon
 *   Pure: takes the already-loaded SchemaMap.
 */
import type { SchemaMap } from './schema.ts';
import { BUILTIN_OFFICIAL_SOURCES } from './link-index.ts';

export interface SiteSources {
  /** Lowercased official site source ids. */
  official: Set<string>;
  /** Lowercased → canonical casing, for messages. */
  canonical: Map<string, string>;
  /** Lowercased source → edition. */
  edition: Map<string, 'classic' | 'one'>;
  /** Grandfathered homebrew ids exempt from the modern id rules (lowercased). */
  legacy: Set<string>;
  /** True when sources-5etools.json was found (else official = builtin list). */
  fromSchema: boolean;
}

type Defs = Record<string, { enum?: unknown[] }>;

function defsOf(schemas: SchemaMap, suffix: string): Defs | null {
  const key = Object.keys(schemas).find(
    (k) => k === suffix || k.endsWith(`/${suffix}`),
  );
  if (!key) return null;
  return ((schemas[key] as { $defs?: Defs }).$defs ?? null) as Defs | null;
}

const strings = (defs: Defs | null, key: string): string[] =>
  (defs?.[key]?.enum ?? []).filter((s): s is string => typeof s === 'string');

export function readSiteSources(schemas: SchemaMap): SiteSources {
  const site = defsOf(schemas, 'sources-5etools.json');
  const legacyDefs = defsOf(schemas, 'sources-homebrew-legacy.json');

  const out: SiteSources = {
    official: new Set(BUILTIN_OFFICIAL_SOURCES),
    canonical: new Map(),
    edition: new Map(),
    legacy: new Set(),
    fromSchema: !!site,
  };
  for (const s of strings(site, 'sources')) {
    out.official.add(s.toLowerCase());
    out.canonical.set(s.toLowerCase(), s);
  }
  for (const s of strings(site, 'sourcesClassic'))
    out.edition.set(s.toLowerCase(), 'classic');
  for (const s of strings(site, 'sourcesModern'))
    out.edition.set(s.toLowerCase(), 'one');
  for (const k of ['sourcesShort', 'sourcesColon'])
    for (const s of strings(legacyDefs, k)) out.legacy.add(s.toLowerCase());
  return out;
}
