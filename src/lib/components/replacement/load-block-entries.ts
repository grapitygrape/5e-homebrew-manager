/**
 * components/replacement/load-block-entries.ts — the blocklist rules the
 * Replace Content views grey their rows against.
 *
 * Kept apart from blocked.ts so that module stays free of I/O and its tests
 * don't pull in the API layer.
 */
import type { BlocklistEntry } from '$lib/engine/blocklist';
import { getBlocklist, type LoadedBlocklist } from '$lib/api';
import { peek, remember } from '$lib/state/page-cache.svelte.ts';

// Same key as Hide Content, which keeps it current when it saves.
const CACHE_KEY = 'blocklist-doc';

/**
 * Hands `apply` the remembered rules at once, then the fresh read. A failed
 * read is swallowed: the views still work, they just can't warn.
 */
export async function loadBlockEntries(
  apply: (entries: BlocklistEntry[]) => void,
): Promise<void> {
  const cached = peek<LoadedBlocklist>(CACHE_KEY);
  if (cached) apply(cached.entries);
  try {
    apply(remember(CACHE_KEY, await getBlocklist()).entries);
  } catch {
    /* nothing to cross-check against */
  }
}
