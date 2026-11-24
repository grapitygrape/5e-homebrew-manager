/**
 * POST /api/replacement/deploy - copy the saved mapping file from the
 * data folder into the data root, where `Renderer.supersede` reads it at
 * `data/content-replacement.json`.
 *
 * Copies what is ON DISK, not the working state, so what you deploy is what you
 * last saved.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deploySupersessions } from '$lib/services/supersession-service';

export const POST: RequestHandler = async () => {
  try {
    return json({ deployed: true, ...(await deploySupersessions()) });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
