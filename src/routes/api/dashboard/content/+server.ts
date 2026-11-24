/** GET /api/dashboard/content — sources in use (see services/dashboard-service). */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dashboardContent } from '$lib/services/dashboard-service';

export const GET: RequestHandler = async () => json(await dashboardContent());
