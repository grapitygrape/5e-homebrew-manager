/**
 * GET /api/collisions[?refresh=1]
 *   → { collisions: Collision[], totals: { errors, warnings, files } }
 *
 * Duplicate identities across brews / official data, source ids that clash
 * with official books, each other, or published homebrew-repo brews, and
 * shared display abbreviations. `refresh=1` rereads the homebrew folder.
 * See engine/audit/collisions.ts.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCollisionReport } from '$lib/services/brew-check-service';

export const GET: RequestHandler = async ({ url }) => {
  return json(
    await getCollisionReport(url.searchParams.get('refresh') === '1'),
  );
};
