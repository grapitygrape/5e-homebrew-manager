/**
 * POST /api/source-display { ids } — how each source id looks: abbreviation
 * and colour, null for ids nothing declares (see services/source-display).
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveSources } from '$lib/services/source-display';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
    throw error(400, 'Expected { ids: string[] }.');
  return json(await resolveSources(ids));
};
