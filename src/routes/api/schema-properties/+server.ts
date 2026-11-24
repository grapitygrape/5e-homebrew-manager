/**
 * GET /api/schema-properties[?guide=<file>] — the validator's schema surface.
 *   With `guide`: that guide's payload (entityType, arrayProp, label, required,
 *   properties). Without: a map of every guide. 404 if the guide/schema is unknown.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  getGuideSchema,
  getAllGuideSchemas,
  getTypeSchema,
} from '$lib/services/schema-service';

export const GET: RequestHandler = async ({ url }) => {
  // ?type=<arrayProp> — schema for ANY homebrew array key (parser/validator).
  const type = url.searchParams.get('type');
  if (type) {
    const payload = await getTypeSchema(type);
    if (!payload) throw error(404, `No schema declared for type: ${type}`);
    return json(payload);
  }
  // ?guide=<file> — schema for a conversion guide (Guides view).
  const guide = url.searchParams.get('guide');
  if (guide) {
    const payload = await getGuideSchema(guide);
    if (!payload)
      throw error(404, `Unknown guide or schema unavailable: ${guide}`);
    return json(payload);
  }
  return json(await getAllGuideSchemas());
};
