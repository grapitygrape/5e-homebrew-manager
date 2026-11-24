/**
 * GET /api/blocklist/search?q=<text>[&type=<prop>][&limit=<n>] - entities whose
 * name matches, across every source. Source names are matched client-side.
 *
 * The picker's one search box. Queries shorter than two characters return
 * nothing rather than most of the corpus.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchEntities } from '$lib/services/content-index-service';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const prop = url.searchParams.get('type') ?? undefined;
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;
  try {
    return json(await searchEntities(q, { prop, limit }));
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
