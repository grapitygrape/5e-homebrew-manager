/** GET /api/replacement/info — the Replacement views' cheap facts (see replacementViewInfo). */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { replacementViewInfo } from '$lib/services/supersession-service';

export const GET: RequestHandler = () => json(replacementViewInfo());
