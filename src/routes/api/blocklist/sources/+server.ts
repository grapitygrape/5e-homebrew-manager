/**
 * GET /api/blocklist/sources — every source in the loaded corpus, each with the
 * content types it contains and a count per type. This is the search index the
 * Hide Content's source picker runs against.
 *
 * Deliberately excludes the individual entries: a source like MM carries
 * thousands, and the UI only needs them once a type is expanded
 * (see /api/blocklist/items).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listSources } from '$lib/services/content-index-service';

export const GET: RequestHandler = async ({ url }) => {
  try {
    return json(await listSources(url.searchParams.get('refresh') === '1'));
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
