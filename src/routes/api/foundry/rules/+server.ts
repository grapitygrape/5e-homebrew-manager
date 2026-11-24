/**
 * POST /api/foundry/rules { clientId, rules } — store the mappings in a
 * connected Foundry world.
 *
 * The module saves them as a world setting, which every client reads to swap
 * superseded items on import. It replaces the previous list, so sending an
 * empty list turns enforcement off.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';
import type { ScanRule } from '$lib/engine/foundry/types.ts';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    rules?: ScanRule[];
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  if (!clientId) throw error(400, 'Missing "clientId".');
  if (!Array.isArray(body?.rules)) throw error(400, 'Missing "rules".');

  let result;
  try {
    result = await command(clientId, { action: 'rules', rules: body.rules });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok)
    throw error(502, result.error ?? 'Foundry could not store the rules.');
  return json(result);
};
