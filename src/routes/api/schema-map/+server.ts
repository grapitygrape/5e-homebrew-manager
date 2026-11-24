/**
 * GET /api/schema-map → every brew schema file, `{ relPath: schemaJson }`.
 * The Parser builds its validator and autocomplete from this in the browser,
 * so checking runs as you type instead of a round trip per edit. `{}` when the
 * schema folder isn't set.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSchemasCached } from '$lib/services/schema-service';

export const GET: RequestHandler = async () =>
  json(await getSchemasCached().catch(() => ({})));
