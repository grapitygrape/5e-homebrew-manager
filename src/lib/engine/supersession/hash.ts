/**
 * engine/supersession/hash.ts - hashes and uids, matching 5etools exactly.
 *
 * The runtime looks a mapping up by the original's `page` + `hash`, so a hash
 * that differs from 5etools' own by one character is a rule that never fires.
 * The blocklist engine already builds those hashes, so this module delegates
 * rather than re-deriving: `entityHash` knows the props whose hash is NOT
 * `name_source` (subraces fold in the parent race, deities carry a pantheon,
 * class features carry class + level), and you can pick any content type here.
 */
import { encodeForHash, entityHash } from '../blocklist/index.ts';
import type { EntityRef } from './types.ts';

/** `name_source`, urlified. */
export const toSupersessionHash = (name: string, source: string): string =>
  encodeForHash(name, source);

/**
 * The 5etools hash for an entity of type `prop`. Equal to `toSupersessionHash`
 * for every prop with a plain `name_source` hash, which is most of them.
 */
export const hashForEntity = (ent: EntityRef): string =>
  entityHash(ent.prop, { name: ent.name, source: ent.source });

/** `"Name|Source"` - the uid form `replacedBy` uses. */
export const packUid = (name: string, source: string): string =>
  `${name}|${source}`;

/**
 * Split a `"Name|Source"` uid. A uid with no separator is a name with no
 * source, which the runtime cannot resolve - callers should treat an empty
 * `source` as invalid rather than guessing one.
 */
export function unpackUid(uid: string): { name: string; source: string } {
  const idx = (uid ?? '').indexOf('|');
  if (idx < 0) return { name: (uid ?? '').trim(), source: '' };
  return {
    name: uid.slice(0, idx).trim(),
    source: uid.slice(idx + 1).trim(),
  };
}

/** Case-insensitive identity for "same entity", used to spot name collisions. */
export const refKey = (name: string, source: string): string =>
  `${name.toLowerCase()}|${source.toLowerCase()}`;
