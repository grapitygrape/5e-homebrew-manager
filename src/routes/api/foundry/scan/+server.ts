/**
 * POST /api/foundry/scan { clientId, scope, rules } — find superseded content
 * in a connected Foundry world's actors and items.
 *
 * The Node half of Replace Content's "Scan Foundry". Rules come from the page
 * (so unsaved mappings scan too); the module does the matching. 409 when the
 * world is gone, 504 when it never answers (a module too old to scan), 502
 * when it answered with an error.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';
import type { ScanRule, ScanScope } from '$lib/engine/foundry/types.ts';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
    scope?: Partial<ScanScope>;
    rules?: ScanRule[];
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  if (!clientId) throw error(400, 'Missing "clientId".');
  if (!Array.isArray(body?.rules)) throw error(400, 'Missing "rules".');

  const scope: ScanScope = {
    characters: !!body?.scope?.characters,
    npcs: !!body?.scope?.npcs,
    items: !!body?.scope?.items,
  };

  let result;
  try {
    result = await command(clientId, {
      action: 'scan',
      scope,
      rules: body.rules,
    });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok) throw error(502, result.error ?? 'Foundry could not scan.');
  return json(result);
};
