/**
 * GET /api/replacement/override-matches?source=&prop= - every entity in
 * another source that shares a name with one of `source`'s `prop` entities,
 * grouped by source, each with that source's full title. Drives the override
 * target picker.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { namedOverrideTargets } from '$lib/services/supersession-service';

export const GET: RequestHandler = async ({ url }) => {
  const source = url.searchParams.get('source') ?? '';
  const prop = url.searchParams.get('prop') ?? '';
  if (!source || !prop) throw error(400, 'Expected "source" and "prop".');
  try {
    return json({ targets: await namedOverrideTargets(prop, source) });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
