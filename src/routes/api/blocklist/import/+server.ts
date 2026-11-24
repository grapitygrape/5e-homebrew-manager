/**
 * POST /api/blocklist/import — validate a blocklist file the user picked, run
 * the same diagnose/repair pass a loaded file gets, and hand the result back for
 * review. Writes nothing: the import lands in the editor's working state, and
 * only Save commits it.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { diagnoseImport } from '$lib/services/blocklist-service';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'That file is not valid JSON.');
  }
  try {
    return json(await diagnoseImport(body));
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
