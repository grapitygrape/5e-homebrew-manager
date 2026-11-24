/**
 * Add a homebrew file load - every brew in Settings' homebrew-repo checkout,
 * flagged when it's already in the working folder. Bodies aren't read here;
 * Scan and Open in Parser fetch on demand.
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { listHomebrewLibrary, type LibraryListing } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: PageLoad = ({ depends }) =>
  cachedLoad('files-library', depends, async () => {
    try {
      return { library: await listHomebrewLibrary(), error: '' };
    } catch (e) {
      const empty: LibraryListing = { path: '', entries: [] };
      return { library: empty, error: (e as Error).message };
    }
  });
