/**
 * GET /api/blocklist — the current `content-blocklist.json`, with every rule
 * resolved against the real content index. Returns the (repaired) entries, the
 * preserved envelope, and a diagnosis per rule that didn't resolve as written.
 *
 * PUT /api/blocklist — overwrite the file. Body: `{ entries, envelope }`. The
 * previous file is rotated to `content-blocklist.json.bak` first.
 *
 * The index is built lazily on first call and can take a few seconds cold; every
 * later request is served from memory until the config changes.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import { loadBlocklist, saveBlocklist } from '$lib/services/blocklist-service';
import type { BlocklistEntry } from '$lib/engine/blocklist';

export const GET = apiHandler(async () => json(await loadBlocklist()));

export const PUT = apiHandler(async ({ request }) => {
  const payload = await parseJsonObject(request);
  if (!Array.isArray(payload.entries))
    throw badRequest('Expected an "entries" array.');

  const result = await saveBlocklist(
    payload.entries as BlocklistEntry[],
    (payload.envelope ?? {}) as Record<string, unknown>,
  );
  return json({ saved: true, ...result });
});
