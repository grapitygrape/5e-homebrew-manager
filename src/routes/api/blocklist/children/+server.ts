/**
 * GET /api/blocklist/children?source=<abbr>&type=<prop>&hash=<hash> — every
 * structural descendant (subclasses, subraces/race variants, derived items,
 * deck cards, summoned creatures) that depends on the addressed parent rule.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listBlocklistChildren } from '$lib/services/content-index-service';

export const GET: RequestHandler = async ({ url }) => {
  const source = url.searchParams.get('source');
  const type = url.searchParams.get('type');
  const hash = url.searchParams.get('hash');
  if (!source || !type || !hash) {
    throw error(400, '"source", "type", and "hash" are required.');
  }
  try {
    const children = await listBlocklistChildren(source, type, hash);
    return json({ source, type, hash, count: children.length, children });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
