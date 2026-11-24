/**
 * POST /api/validate — the one validation endpoint. Resolves ALL errors —
 * schema validation against each content type's real brew schema AND the
 * content-link audit — in a single call.
 *
 * Body: the homebrew file's parsed JSON (the Parser posts its editor content,
 * saved or not; the document doubles as a local overlay so self-references
 * resolve before saving).
 *   → { totals, types, issues: EntityIssues[] } — issues keyed by
 *   type + entityIdx, matching engine.parseHomebrewFile ordering.
 *
 * Message anatomy: schema issues carry { message (plain), html (UI form) };
 * link issues carry { severity, msg (HTML), plain, at (top-level property),
 * raw (exact tag text) }. GET /api/homebrew-scan?file=X&detail=1 returns the
 * same shape for a file on disk.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, parseJsonObject } from '$lib/server/http';
import { validateDocument } from '$lib/services/validate-service';

export const POST = apiHandler(async ({ request }) => {
  const doc = await parseJsonObject(request, 'a homebrew file object');
  return json(await validateDocument(doc));
});
