/**
 * POST /api/blocklist/orphans — every allowed entity whose parent/ancestor is
 * blocked under the supplied working blocklist rules.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listAllowedWithBlockedParents } from '$lib/services/content-index-service';
import type { BlocklistEntry } from '$lib/engine/blocklist';

export const POST: RequestHandler = async ({ request }) => {
  let body: { entries?: unknown };
  try {
    body = (await request.json()) as { entries?: unknown };
  } catch {
    throw error(400, 'Invalid JSON body.');
  }
  if (!Array.isArray(body?.entries)) {
    throw error(400, '"entries" array is required.');
  }
  const entries = body.entries.filter(
    (e): e is Pick<BlocklistEntry, 'hash' | 'category' | 'source'> =>
      Boolean(
        e &&
          typeof e === 'object' &&
          typeof (e as Record<string, unknown>).hash === 'string' &&
          typeof (e as Record<string, unknown>).category === 'string' &&
          typeof (e as Record<string, unknown>).source === 'string',
      ),
  );
  try {
    const items = await listAllowedWithBlockedParents(entries);
    return json({ count: items.length, items });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
