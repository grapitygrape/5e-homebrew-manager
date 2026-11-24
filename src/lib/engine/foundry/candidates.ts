/**
 * engine/foundry/candidates.ts — turn a parsed homebrew file into the list of
 * things to go looking for in Foundry.
 *
 * INTENT
 *   Pure and sync, like the rest of engine/: the Files view's "Check Foundry"
 *   button needs a deterministic, testable list of (type, name, source) before
 *   anything touches the network. Which 5etools array keys map onto which
 *   Foundry document subtype lives here and nowhere else.
 *
 * SCOPE
 *   Items, spells, and feats/features — everything that lands as a Foundry
 *   *Item* document in dnd5e. Monsters (Actors) are deliberately excluded:
 *   Actors have no `system.activities`, so the "has activities" check has no
 *   meaning for them and the report would need a second shape. Add them by
 *   extending TYPE_MAP with `docClass: 'Actor'` when that's worth doing.
 *
 * EXTEND
 *   New homebrew type → one TYPE_MAP entry. `expect` is the Foundry subtype(s)
 *   the import *should* produce; leave it empty to accept any subtype.
 */
import type { Candidate, FoundryDocClass } from './types.ts';

interface TypeMapping {
  docClass: FoundryDocClass;
  /** Foundry subtypes this homebrew type should become. Empty = any. */
  expect: string[];
}

/**
 * 5etools array key → Foundry document. Only keys listed here are checked;
 * everything else in a homebrew file is ignored by this feature.
 */
export const TYPE_MAP: Readonly<Record<string, TypeMapping>> = {
  // Items — an import may legitimately pick any of the dnd5e item subtypes
  // (weapon / equipment / consumable / tool / loot / container), so `expect`
  // is open. `docType` still comes back in the report so you can eyeball it.
  item: { docClass: 'Item', expect: [] },
  baseitem: { docClass: 'Item', expect: [] },
  itemGroup: { docClass: 'Item', expect: [] },
  magicvariant: { docClass: 'Item', expect: [] },

  // Spells
  spell: { docClass: 'Item', expect: ['spell'] },

  // Feats + features. dnd5e models all of these as `feat`.
  feat: { docClass: 'Item', expect: ['feat'] },
  optionalfeature: { docClass: 'Item', expect: ['feat'] },
  classFeature: { docClass: 'Item', expect: ['feat'] },
  subclassFeature: { docClass: 'Item', expect: ['feat'] },
};

/** The array keys this check knows how to handle, for UI copy. */
export const CHECKED_TYPES: readonly string[] = Object.keys(TYPE_MAP);

interface MetaSource {
  json?: string;
  abbreviation?: string;
  full?: string;
}

const metaSources = (doc: Record<string, unknown>): MetaSource[] =>
  (doc._meta as { sources?: MetaSource[] } | undefined)?.sources ?? [];

/** `_meta.sources[0].json` — the file's own source abbreviation, if declared. */
export function metaSource(doc: Record<string, unknown>): string {
  const first = metaSources(doc)[0];
  return String(first?.json ?? first?.abbreviation ?? '');
}

/**
 * Every name the file gives a source: its json id plus the abbreviation and
 * full title from the matching `_meta.sources` entry. A Foundry import may
 * record any of them, so the report compares against all.
 */
export function sourceNames(
  doc: Record<string, unknown>,
  source: string,
): string[] {
  if (!source) return [];
  const key = source.toLowerCase();
  const meta = metaSources(doc).find(
    (s) =>
      s.json?.toLowerCase() === key || s.abbreviation?.toLowerCase() === key,
  );
  const names = [source, meta?.json, meta?.abbreviation, meta?.full];
  return [...new Set(names.map((n) => (n ?? '').trim()).filter(Boolean))];
}

/**
 * Every checkable entity in a parsed homebrew document, in file order.
 *
 * Entities without a `name` are skipped — there is nothing to match on. An
 * entity's own `source` wins over the file's `_meta` source.
 */
export function buildCandidates(doc: Record<string, unknown>): Candidate[] {
  const fallbackSource = metaSource(doc);
  const out: Candidate[] = [];

  for (const [type, mapping] of Object.entries(TYPE_MAP)) {
    const arr = doc[type];
    if (!Array.isArray(arr)) continue;

    arr.forEach((raw, index) => {
      const entity = raw as Record<string, unknown> | null;
      if (!entity || typeof entity !== 'object') return;

      // magicvariant carries its display name under `name`, but some brews only
      // set `inherits.namePrefix/nameSuffix`; without a `name` there is nothing
      // a Foundry document could be matched against, so skip rather than guess.
      const name = typeof entity.name === 'string' ? entity.name.trim() : '';
      if (!name) return;

      const source =
        typeof entity.source === 'string' && entity.source
          ? entity.source
          : fallbackSource;
      out.push({
        id: `${type}:${index}`,
        type,
        name,
        source,
        sourceNames: sourceNames(doc, source),
        docClass: mapping.docClass,
        expect: mapping.expect,
      });
    });
  }

  return out;
}

/** Per-type counts of what `buildCandidates` produced — for the report header. */
export function candidateCounts(
  candidates: Candidate[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of candidates) counts[c.type] = (counts[c.type] ?? 0) + 1;
  return counts;
}
