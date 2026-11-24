/**
 * POST /api/foundry/ping { clientId } — is a listed world still answering?
 *
 * The status list only says a stream was opened; a world can sit there after
 * its tab slept. Any reply counts as alive, even an older module's "Unknown
 * command". 409 when the world is gone, 504 when it doesn't answer in time.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  if (!clientId) throw error(400, 'Missing "clientId".');

  try {
    await command(clientId, { action: 'ping' });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  return json({ alive: true });
};
