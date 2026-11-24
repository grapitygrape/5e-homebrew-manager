/**
 * Files load - metadata for every homebrew file in the configured folder
 * (name, size, per-array counts, parse errors). Bodies aren't loaded here; the
 * Scan button and "Open in Parser" fetch on demand.
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { listHomebrewFiles, type HomebrewFiles } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: PageLoad = ({ depends }) =>
  cachedLoad('files', depends, () =>
    listHomebrewFiles().catch((): HomebrewFiles => ({
      homebrew: { path: '', exists: false, files: [] },
      canDeploy: false,
      upstream: {},
      index: null,
    })),
  );
