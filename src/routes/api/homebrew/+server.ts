import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/http';
import { listHomebrewFiles } from '$lib/services/homebrew-index';

export const GET = apiHandler(async () => json(await listHomebrewFiles()));
