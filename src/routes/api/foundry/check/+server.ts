/**
 * POST /api/foundry/check — "does Foundry have this homebrew file's content?"
 *
 * Body: { file: string, clientId?: string, fuzzy?: boolean,
 *         fuzzyThreshold?: number, maxMatches?: number }
 *
 * The check itself is services/foundry-check-service; this route runs it over
 * the `hm-backend` bridge (lib/server/backend). `clientId` is optional: with
 * exactly one world connected the UI doesn't have to care which. With several,
 * it must choose — an ambiguous request is a 409, not a guess.
 *
 * This route is also the agent/CLI surface: `curl -X POST … -d '{"file":"x.json"}'`
 * returns the whole report as JSON.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ask, listClients } from '$lib/server/backend';
import {
  checkFoundryFile,
  FoundryCheckError,
  type BridgeTransport,
  type CheckRequest,
} from '$lib/services/foundry-check-service';

const nodeTransport: BridgeTransport = {
  listClients: () => listClients(),
  ask,
};

export const POST: RequestHandler = async ({ request }) => {
  let body: CheckRequest;
  try {
    body = (await request.json()) as CheckRequest;
  } catch {
    throw error(400, 'Body must be JSON.');
  }
  try {
    return json(await checkFoundryFile(body, nodeTransport));
  } catch (e) {
    if (e instanceof FoundryCheckError) throw error(e.status, e.message);
    throw e;
  }
};
