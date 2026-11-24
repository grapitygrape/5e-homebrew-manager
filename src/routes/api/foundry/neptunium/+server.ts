/**
 * POST /api/foundry/neptunium { clientId } — set a connected world's Neptunium
 * data source settings from this server's config.
 *
 * The settings are worked out here, not sent by the caller, so the endpoint
 * can't be used to write anything else into Neptunium's config. Answers
 * `{ ok, skipped: true }` when the Customize Site module is off.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { command } from '$lib/server/backend';
import { neptuniumSettingsFromConfig } from '$lib/services/foundry-check-service';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    clientId?: string;
  } | null;
  const clientId = String(body?.clientId ?? '').trim();
  if (!clientId) throw error(400, 'Missing "clientId".');

  const settings = neptuniumSettingsFromConfig();
  if (!settings) return json({ ok: true, skipped: true });

  let result;
  try {
    result = await command(clientId, { action: 'neptunium', settings });
  } catch (e) {
    const message = (e as Error).message;
    throw error(message.includes('no longer connected') ? 409 : 504, message);
  }
  if (!result.ok)
    throw error(
      502,
      result.error ?? 'Foundry could not change the Neptunium settings.',
    );
  return json(result);
};
