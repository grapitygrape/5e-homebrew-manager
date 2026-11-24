/**
 * GET /api/schema-types → [{ type, label }] for every homebrew entity array the
 * brew schema declares. The Schema Reference sidebar, in a plain browser tab.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listHomebrewTypes } from '$lib/services/schema-service';

export const GET: RequestHandler = async () => json(await listHomebrewTypes());
