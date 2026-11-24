/**
 * Hide Content — load.
 *
 * Deliberately thin. The content index behind this view is a multi-second scan
 * on a cold start, and blocking the first paint on it would make the tab feel
 * broken. So the load returns only what's cheap — where the file lives, whether
 * the index is already warm — and the page fetches the corpus itself with a
 * visible loading state.
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { getBlocklistViewInfo } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: PageLoad = ({ depends }) =>
  cachedLoad('blocklist-info', depends, getBlocklistViewInfo);
