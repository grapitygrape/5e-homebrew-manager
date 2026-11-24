/**
 * GET /api/homebrew-scan?file=<name>[&detail=1] — validate a homebrew file on
 * disk. Delegates to the shared validate-service (schema validation against
 * each content type's real brew schema + the content-link audit), so its
 * results always match POST /api/validate and the Parser.
 *
 * Default response: { file, totals, types } (the Files view's scan line).
 * With detail=1: adds `issues` — every problematic entity with schemaErrors /
 * schemaWarnings ({ message, html }) and linkErrors / linkWarnings (LinkIssues
 * with plain text, `at` property, exact `raw` tag span). The agent surface.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataSource } from '$lib/services/datasource';
import { validateDocument } from '$lib/services/validate-service';

export const GET: RequestHandler = async ({ url }) => {
  const file = url.searchParams.get('file');
  if (!file) throw error(400, 'Missing file parameter');

  let data: Record<string, unknown>;
  try {
    data = await getDataSource().readHomebrew(file);
  } catch (e) {
    throw error(404, (e as Error).message);
  }

  const result = await validateDocument(data);
  if (url.searchParams.get('detail') === '1') {
    return json({
      file,
      totals: result.totals,
      types: result.types,
      issues: result.issues,
    });
  }
  return json({ file, totals: result.totals, types: result.types });
};
