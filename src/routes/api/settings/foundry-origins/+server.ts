/**
 * POST /api/settings/foundry-origins { origin } — add a refused Foundry origin
 * to Settings → Foundry URL (the Files view's Allow button). Answers the saved
 * list. Deliberately outside /api/foundry, which is the one cross-origin
 * surface: a Foundry page must never be able to allow itself.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { allowFoundryOrigin } from '$lib/services/settings-service';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    origin?: string;
  } | null;
  try {
    return json({
      foundryUrls: await allowFoundryOrigin(String(body?.origin ?? '')),
    });
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
