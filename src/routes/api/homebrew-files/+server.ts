/** GET /api/homebrew-files — the Files view's listing (see services/homebrew-index). */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listHomebrewFiles } from '$lib/services/homebrew-index';

export const GET: RequestHandler = async () => json(await listHomebrewFiles());
