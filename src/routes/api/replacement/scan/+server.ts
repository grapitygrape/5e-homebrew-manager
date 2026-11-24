/**
 * GET /api/replacement/scan - every "Replaces:" marker in the corpus, as
 * candidate rows plus the notes that could not be mapped.
 *
 * Returns candidates unfiltered. The client subtracts what its in-memory rows
 * already contain, because those rows include unsaved edits this process has
 * never seen.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanAllMarkers } from '$lib/services/supersession-service';

export const GET: RequestHandler = async () => {
  try {
    return json(await scanAllMarkers());
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
