/**
 * engine/merge/merge.ts — combine official + homebrew records into one resolved list.
 *
 * INTENT
 *   Annotate provenance, drop blocklisted entries, then resolve every `_copy`.
 *   Crucially this does NO I/O —
 *   callers (a DataSource) load the arrays; this just merges them. That split is
 *   what makes the engine runtime-agnostic (Node FS, HTTP, or browser picker).
 *
 * REUSE NOTES
 *   - One generic function for every entity type. The `type` drives both
 *     blocklist category (caller-supplied) and `_copy` identity keys.
 */
import type { Entity, BlocklistLookup } from '../types.ts';
import { isBlocked } from './blocklist.ts';
import { resolveCopy, getEntityKey } from './copy.ts';

export interface MergeInput {
  /** Entity-type label, used for `_copy` identity (e.g. 'item', 'subclassFeature'). */
  type: string;
  /** Already-loaded official records (no provenance yet). */
  official?: Entity[];
  /** Already-loaded homebrew records, optionally tagged with their filename. */
  homebrew?: { file?: string; entities: Entity[] }[];
  /** Blocklist category for these records (often equals `type`). */
  blocklistCategory?: string;
  blocklist?: BlocklistLookup;
}

/** Merge → blocklist-filter → resolve `_copy`. Returns display-ready entities. */
export function mergeEntities({
  type,
  official = [],
  homebrew = [],
  blocklistCategory = '',
  blocklist = {},
}: MergeInput): Entity[] {
  const category = blocklistCategory || type;
  const list: Entity[] = [];

  for (const entity of official) {
    if (!isBlocked(entity, category, blocklist))
      list.push({ ...entity, _isHomebrew: false });
  }
  for (const { file, entities } of homebrew) {
    for (const entity of entities) {
      if (!isBlocked(entity, category, blocklist))
        list.push({ ...entity, _isHomebrew: true, _homebrewFile: file });
    }
  }

  // `_copy` identity map. Later entries win on a key collision, so homebrew
  // shadows official.
  const entityMap: Record<string, Entity> = {};
  for (const entity of list) {
    const key = getEntityKey(entity as Record<string, unknown>, type);
    if (key) entityMap[key] = entity;
  }

  return list.map((entity) => {
    try {
      return resolveCopy(entity, entityMap, type);
    } catch {
      return entity; // a single bad copy never sinks the whole list
    }
  });
}
