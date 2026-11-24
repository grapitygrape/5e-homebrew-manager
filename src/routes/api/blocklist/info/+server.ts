/** GET /api/blocklist/info — the Blocklist view's cheap facts (see blocklistViewInfo). */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { blocklistViewInfo } from '$lib/services/blocklist-service';

export const GET: RequestHandler = () => json(blocklistViewInfo());
