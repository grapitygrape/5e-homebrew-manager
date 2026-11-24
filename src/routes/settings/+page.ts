/**
 * Settings load — the effective config + per-source status (path exists?).
 * Saving happens in the page through lib/api, which persists hbm-config.json
 * and hot-resets the DataSource + downstream caches.
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { getSettings } from '$lib/api';

export const ssr = false;

export const load: PageLoad = () => getSettings();
