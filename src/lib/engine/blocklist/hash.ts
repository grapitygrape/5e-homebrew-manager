/**
 * engine/blocklist/hash.ts — 5etools entity hashes, ported from UrlUtil.
 *
 * INTENT
 *   A blocklist entry identifies content by `hash`, and that hash must be
 *   byte-identical to the one 5etools' `UrlUtil.URL_TO_HASH_BUILDER[prop]`
 *   produces — otherwise the entry we write is a rule that never fires. This is
 *   the single definition of that hash for the manager. Pure; no I/O.
 *
 * PARITY NOTES (verified against a real content-blocklist.json)
 *   - `toUrlified` is exactly `encodeURIComponent(s.toLowerCase()).toLowerCase()`.
 *     That leaves `(`, `)` and `'` UNENCODED while encoding `:`→%3a and `;`→%3b.
 *     Real entries prove it: `gnome%20(forest%20variant%3a%20lorghalan)_…` and
 *     `artisan's%20guild%20feature_craftsman_vss_10_vss`. Do NOT "helpfully"
 *     percent-encode parens/apostrophes — 5etools does not, and the rule breaks.
 *   - Most props are `name_source`. The exceptions below are not cosmetic:
 *     class features carry their class + level, subraces fold the parent race
 *     into the name, deities carry a pantheon, books/adventures use `id`.
 *   - `HASH_LIST_SEP` is `_`, `HASH_PART_SEP` is `,`, `HASH_SUB_KV_SEP` is `:`.
 *
 * EXTEND
 *   New 5etools prop → add a builder here (or let it fall through to generic)
 *   and register it in catalog.ts. Nothing else needs to change.
 */

/** 5etools `String.prototype.toUrlified`. */
export const toUrlified = (value: unknown): string =>
  encodeURIComponent(String(value ?? '').toLowerCase()).toLowerCase();

/** 5etools `UrlUtil.encodeArrayForHash` — parts joined by `_`, each urlified. */
export const encodeForHash = (...parts: unknown[]): string =>
  parts.map(toUrlified).join('_');

/** A loose entity: we only ever read a handful of identity fields off it. */
export type HashableEntity = Record<string, unknown>;

/**
 * 5etools `SourceUtil.getEntitySource` — generic variants keep their source on
 * `inherits`, so reading `.source` alone silently drops them.
 */
export function entitySource(ent: HashableEntity | null | undefined): string {
  if (!ent) return '';
  const direct = ent.source;
  if (typeof direct === 'string' && direct) return direct;
  const inherits = ent.inherits as { source?: unknown } | undefined;
  const inherited = inherits?.source;
  return typeof inherited === 'string' ? inherited : '';
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : v == null ? '' : String(v);

export type HashBuilder = (ent: HashableEntity) => string;

/** `name_source` — the shape used by the large majority of props. */
const generic: HashBuilder = (ent) =>
  encodeForHash(str(ent.name), entitySource(ent));

/** 5etools `Hist.util.getCleanHash`: collapse repeated commas, drop trailing, lowercase. */
const cleanHash = (hash: string): string =>
  hash.replace(/,+/g, ',').replace(/,$/, '').toLowerCase();

/**
 * Per-prop builders. Anything absent from this map uses `generic`, which matches
 * 5etools' own fallback in blocklist-ui.js (`UrlUtil.encodeForHash([name, source])`).
 */
export const HASH_BUILDERS: Record<string, HashBuilder> = {
  // A subrace's hash is the *race* page hash of "Name (Parent Race)".
  subrace: (ent) =>
    encodeForHash(`${str(ent.name)} (${str(ent.raceName)})`, entitySource(ent)),

  // Class features carry the class they hang off, and their level.
  classFeature: (ent) =>
    encodeForHash(
      str(ent.name),
      str(ent.className),
      str(ent.classSource),
      ent.level,
      entitySource(ent),
    ),

  subclassFeature: (ent) =>
    encodeForHash(
      str(ent.name),
      str(ent.className),
      str(ent.classSource),
      str(ent.subclassShortName),
      str(ent.subclassSource),
      ent.level,
      entitySource(ent),
    ),

  // A subclass is addressed as a *state part* of its class page:
  //   `bard_phb,state:sub-lore_phb=b1`   (b1 === mini.compress(true))
  subclass: (ent) => {
    const classHash = encodeForHash(str(ent.className), str(ent.classSource));
    const key = encodeForHash(
      'sub',
      str(ent.shortName) || str(ent.name),
      entitySource(ent),
    );
    return cleanHash(`${classHash},state:${key}=b1`);
  },

  deity: (ent) =>
    encodeForHash(str(ent.name), str(ent.pantheon), entitySource(ent)),

  // Books and adventures are addressed by id, not name.
  book: (ent) => encodeForHash(str(ent.id)),
  adventure: (ent) => encodeForHash(str(ent.id)),

  card: (ent) => encodeForHash(str(ent.name), str(ent.set), entitySource(ent)),

  raceFeature: (ent) =>
    encodeForHash(
      str(ent.name),
      str(ent.raceName),
      str(ent.raceSource),
      entitySource(ent),
    ),
};

/** The 5etools hash for `ent` as content of type `prop`. */
export const entityHash = (prop: string, ent: HashableEntity): string =>
  (HASH_BUILDERS[prop] ?? generic)(ent);

/** True when a hash/category/source field is the "everything" wildcard. */
export const isWildcard = (value: string | undefined | null): boolean =>
  value === '*';
