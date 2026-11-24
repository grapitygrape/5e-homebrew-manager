/**
 * state/index-mismatch.svelte.ts - how many homebrew files the folder and its
 * index.json disagree on, for the badge on the Files nav link.
 *
 * The layout checks at startup, after each Prepare and on navigation; the
 * Files view sets it from its own listing so the badge matches what it shows.
 */
import { getIndexMismatch, type IndexMismatch } from '$lib/api';

export const indexMismatch = $state({ count: 0 });

export function countMismatch(index: IndexMismatch | null): number {
  return index ? index.unlisted.length + index.missing.length : 0;
}

export function setIndexMismatch(index: IndexMismatch | null): void {
  indexMismatch.count = countMismatch(index);
}

/** Re-check; a folder that can't be read counts as nothing to report. */
export async function refreshIndexMismatch(): Promise<void> {
  setIndexMismatch(await getIndexMismatch().catch(() => null));
}
