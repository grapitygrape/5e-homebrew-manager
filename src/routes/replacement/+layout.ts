/**
 * Replace Content - load, shared by the table and the picker.
 *
 * Thin for the same reason the Blocklist's is: the corpus index behind the
 * browser is a multi-second cold scan, so the page fetches it itself with a
 * visible loading state. What comes back here is only what's cheap to answer -
 * where the two copies of the mapping file live, and whether we can write them.
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { LayoutLoad } from './$types';
import { getReplacementViewInfo } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: LayoutLoad = ({ depends }) =>
  cachedLoad('replacement-info', depends, getReplacementViewInfo);
