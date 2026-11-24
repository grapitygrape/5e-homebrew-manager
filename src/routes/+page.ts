/**
 * Dashboard load — the homebrew listing, the guide-coverage audit, links and
 * sources (see services/dashboard-service).
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { getDashboard } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: PageLoad = ({ depends }) =>
  cachedLoad('dashboard', depends, () => getDashboard({ includeAudit: false }));
