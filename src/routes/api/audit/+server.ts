/**
 * GET /api/audit[?refresh=1] — guide-coverage report { timestamp, summary, details }.
 * Cached; pass refresh=1 to recompute (the Dashboard's "Run Audit" button).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAudit } from '$lib/services/audit-service';

export const GET: RequestHandler = async ({ url }) => {
  const refresh = url.searchParams.get('refresh');
  return json(await runAudit(refresh === '1' || refresh === 'true'));
};
