/**
 * engine/merge/blocklist.ts — 5etools content-blocklist matching.
 *
 * INTENT
 *   Decide whether an entity is excluded by a `content-blocklist.json`. Mirrors
 *   5etools' ExcludeUtil hashing and its 8 wildcard match patterns so the hub's
 *   merged view hides exactly what the site would. Pure functions.
 *
 * REUSE NOTES
 *   - `buildBlocklistLookup` parses the file's `blocklist` array once;
 *     `isBlocked` is then O(1) per entity. Missing name/source ⇒ blocked.
 */
import type { BlocklistLookup } from '../types.ts';

interface BlocklistFile {
  blocklist?: { hash?: string; category?: string; source?: string }[];
}

export function buildBlocklistLookup(
  file: BlocklistFile | null | undefined,
): BlocklistLookup {
  const lookup: BlocklistLookup = {};
  for (const entry of file?.blocklist ?? []) {
    const hash = (entry.hash || '').toLowerCase();
    const category = (entry.category || '').toLowerCase();
    const source = (entry.source || '').toLowerCase();
    lookup[`${hash}__${category}__${source}`] = true;
  }
  return lookup;
}

/** True if `entity` matches any blocklist rule for `category`. */
export function isBlocked(
  entity: { name?: string; source?: string } | null | undefined,
  category: string,
  lookup: BlocklistLookup,
): boolean {
  if (!entity || !entity.name || !entity.source) return true;

  const cat = category.toLowerCase();
  const source = entity.source.toLowerCase();
  const cleanHash = encodeURIComponent(entity.name.toLowerCase())
    .toLowerCase()
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27');

  const uids = [
    `${cleanHash}__${cat}__${source}`,
    `*__${cat}__${source}`,
    `${cleanHash}__*__${source}`,
    `${cleanHash}__${cat}__*`,
    `*__*__${source}`,
    `*__${cat}__*`,
    `${cleanHash}__*__*`,
    `*__*__*`,
  ];
  return uids.some((uid) => lookup[uid]);
}
