/**
 * components/replacement/blocked.ts — "is this already blocked?" for the
 * Replace Content page.
 *
 * WHY THIS EXISTS
 *   Replacement REDIRECTS content; the blocklist HIDES it. The two files are
 *   deliberately separate, but they intersect in one way that matters: a
 *   mapping into or out of blocked content is dead. Nobody ever reaches a
 *   blocked original, and a blocked replacement is a redirect to something the
 *   site won't render. This module answers that question so the page can grey
 *   those rows out and offer to hide them.
 *
 * TWO KINDS OF QUESTION
 *   A corpus entry arrives fully identified (hash + prop + source), so it can
 *   go straight to `coverage()` — the same predicate the Blocklist page uses.
 *   A mapping TARGET arrives as `{ uid: "Name|Source", prop }`, so the source
 *   and type are known but the hash is not. Wildcard rules need only those two
 *   and are always decidable. An exact-hash rule needs the hash rebuilt, which
 *   works for the props that hash as plain `name_source` — the overwhelming
 *   majority, and every prop a "Replaces:" marker can name. The handful with
 *   compound hashes (a subclass carries its class, a class feature its level)
 *   cannot be rebuilt from a uid, so for those only the wildcard rules are
 *   consulted. That under-reports rather than striking through a live mapping.
 */
import type { BlocklistEntry } from '$lib/engine/blocklist';
import { encodeForHash, HASH_BUILDERS } from '$lib/engine/blocklist';
import { coverage, keyFor } from '$lib/components/blocklist/blocklist-model.ts';
import { unpackUid } from '$lib/engine/supersession';
import type { ReplacedByRef, SupersessionRow } from '$lib/engine/supersession';

export interface BlockedIndex {
  /** `hash__category__source`, as the Blocklist page keys its rules. */
  ruleKeys: Set<string>;
}

export function buildBlockedIndex(entries: BlocklistEntry[]): BlockedIndex {
  const ruleKeys = new Set<string>();
  for (const e of entries) ruleKeys.add(keyFor(e.hash, e.category, e.source));
  return { ruleKeys };
}

export const EMPTY_BLOCKED_INDEX: BlockedIndex = buildBlockedIndex([]);

/** A fully-identified corpus entry: exact rule, or a broader one covering it. */
export const isEntityBlocked = (
  ix: BlockedIndex,
  hash: string,
  prop: string,
  source: string,
): boolean => coverage(ix.ruleKeys, hash, prop, source) !== 'none';

/**
 * A mapping target. A uid with no source can't be resolved by the site either,
 * so it is never reported as blocked. See the header for why the exact-hash
 * check is skipped for compound-hash props.
 */
export function isUidBlocked(ix: BlockedIndex, ref: ReplacedByRef): boolean {
  const { name, source } = unpackUid(ref.uid);
  if (!source || source === '?') return false;
  const prop = ref.prop || '';
  // Both wildcard forms need only the source and the type, which a target has.
  if (coverage(ix.ruleKeys, '*', '*', source) !== 'none') return true;
  if (prop && coverage(ix.ruleKeys, '*', prop, source) !== 'none') return true;
  // A compound hash (subclass, classFeature, .) can't be rebuilt from a uid.
  if (!prop || HASH_BUILDERS[prop]) return false;
  return (
    coverage(ix.ruleKeys, encodeForHash(name, source), prop, source) !== 'none'
  );
}

/** Which half of a mapping is blocked — the page words the tooltip from this. */
export interface RowBlock {
  original: boolean;
  /** Targets blocked, by uid. */
  targets: string[];
}

export function blockedParts(ix: BlockedIndex, row: SupersessionRow): RowBlock {
  return {
    original: isEntityBlocked(ix, row.hash, row.prop, row.source),
    targets: row.replacedBy
      .filter((t) => isUidBlocked(ix, t))
      .map((t) => t.uid),
  };
}

/** True when a mapping is dead at either end. */
export const isRowBlocked = (
  ix: BlockedIndex,
  row: SupersessionRow,
): boolean => {
  const parts = blockedParts(ix, row);
  return parts.original || parts.targets.length > 0;
};

/** Why a row is greyed, for a `title=`. Empty when it isn't. */
export function describeBlock(ix: BlockedIndex, row: SupersessionRow): string {
  const { original, targets } = blockedParts(ix, row);
  const parts: string[] = [];
  if (original)
    parts.push(
      `the original (${row.displayName}, ${row.source}) is blocked, so nothing ever reaches this redirect`,
    );
  if (targets.length)
    parts.push(
      `${targets.join(', ')} ${targets.length === 1 ? 'is' : 'are'} blocked, so this redirects to hidden content`,
    );
  return parts.length
    ? `Dead mapping: ${parts.join('; ')}. Edit content-blocklist.json, or drop the mapping.`
    : '';
}
