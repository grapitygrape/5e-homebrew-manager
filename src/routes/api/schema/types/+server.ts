import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/http';
import { listHomebrewTypes } from '$lib/services/schema-service';

export const GET = apiHandler(async () => json(await listHomebrewTypes()));
