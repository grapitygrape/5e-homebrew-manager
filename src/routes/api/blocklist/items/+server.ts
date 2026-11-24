/**
 * GET /api/blocklist/items?type=<prop>[&source=<abbr>] — the individual entries
 * of a content type, name-sorted, each with the site hash the blocklist
 * needs.
 *
 * With `source`, one source's entries — what expanding a single type costs, so
 * opening a hundred-thousand-entity corpus stays one small request at a time.
 * Without it, that type across EVERY source, grouped by source: the category
 * filter opens the same type everywhere at once, and 156 round trips to draw
 * one screen is the thing worth avoiding.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  listSourceItems,
  listItemsByProp,
} from '$lib/services/content-index-service';

export const GET: RequestHandler = async ({ url }) => {
  const source = url.searchParams.get('source');
  const type = url.searchParams.get('type');
  if (!type) throw error(400, '"type" is required.');
  try {
    if (!source) {
      const bySource = await listItemsByProp(type);
      const count = Object.values(bySource).reduce(
        (n, list) => n + list.length,
        0,
      );
      return json({ type, count, bySource });
    }
    const items = await listSourceItems(source, type);
    return json({ source, type, count: items.length, items });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
