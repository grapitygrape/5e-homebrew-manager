/** GET /api/dashboard — the Dashboard's view (see services/dashboard-service). */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dashboardView } from '$lib/services/dashboard-service';

export const GET: RequestHandler = async ({ url }) =>
  json(
    await dashboardView({
      includeAudit: url.searchParams.get('deferAudit') !== '1',
    }),
  );
