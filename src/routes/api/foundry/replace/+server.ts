/**
 * POST /api/foundry/replace { clientId, uuid, rule } — swap one actor's item
 * for what replaces it, in a connected Foundry world.
 *
 * The module keeps the slot (sort order, container, Tidy sections) and points
 * favorites and pins at the new item; see foundry-homebrew-bridge/scripts/replace.js.
 * 409 when the world is gone, 504 when it never answers, 502 when it answered
 * with an error (no such item, replacement not found).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';
import type { ScanRule } from '$lib/engine/foundry/types.ts';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    uuid?: string;
    rule?: ScanRule;
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  const uuid = String(body?.uuid ?? '').trim();
  if (!clientId || !uuid || !body?.rule?.originalName)
    throw error(400, 'Missing "clientId", "uuid" or "rule".');

  let result;
  try {
    result = await command(clientId, {
      action: 'replace',
      uuid,
      rule: body.rule,
    });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok)
    throw error(502, result.error ?? 'Foundry could not replace that item.');
  return json(result);
};
