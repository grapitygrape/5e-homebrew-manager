/**
 * GET  /api/bridge-deploy — where the Foundry bridge module would deploy, and
 *      whether the installed copy matches the repo.
 * POST /api/bridge-deploy {} — copy it into Foundry's Data/modules, overwriting.
 * POST /api/bridge-deploy { sync: true } — only when missing or out of date;
 *      what a Settings save runs. Answers `null` when nothing needed copying.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  bridgeDeployStatus,
  deployBridge,
  syncBridge,
} from '$lib/services/bridge-deploy';

export const GET: RequestHandler = async () => json(await bridgeDeployStatus());

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { sync?: boolean };
  try {
    return json(body.sync ? await syncBridge() : await deployBridge());
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
