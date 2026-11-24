/**
 * POST /api/foundry/blocklist { clientId, rules } — replace Neptunium's World
 * Content Blocklist in a connected world.
 *
 * Neptunium never reads the deployed content-blocklist.json, so the Blocklist
 * page's Deploy sends the rules here too. The module keeps Neptunium's own
 * auto-managed rows and skips the write when nothing changed.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';
import type { WorldBlocklistRule } from '$lib/engine/foundry/types.ts';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    rules?: WorldBlocklistRule[];
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  if (!clientId) throw error(400, 'Missing "clientId".');
  if (!Array.isArray(body?.rules)) throw error(400, 'Missing "rules".');

  let result;
  try {
    result = await command(clientId, { action: 'blocklist', rules: body.rules });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok)
    throw error(502, result.error ?? 'Foundry could not store the blocklist.');
  return json(result);
};
