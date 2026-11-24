/**
 * POST /api/foundry/open { clientId, uuid } — open a document's sheet in a
 * connected Foundry world.
 *
 * The Node half of the report's "Open in Foundry" button: pushes a `command`
 * down the world's stream and waits for the module to confirm. 409 when the
 * world is gone, 504 when it never answers (a module too old to know the
 * command), 502 when it answered with an error (no such document).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    uuid?: string;
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  const uuid = String(body?.uuid ?? '').trim();
  if (!clientId || !uuid) throw error(400, 'Missing "clientId" or "uuid".');

  let result;
  try {
    result = await command(clientId, { action: 'open', uuid });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok)
    throw error(502, result.error ?? 'Foundry could not open that sheet.');
  return json(result);
};
