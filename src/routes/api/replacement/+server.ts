/**
 * GET /api/replacement - the current `content-replacement.json` from the
 * data folder, normalised (a lone `replacedBy` object becomes a
 * one-item list, two rows on one original become a split).
 *
 * Rows made by an override rule are left out; each rule comes back once in
 * `overrides` with the count of rows it made.
 *
 * PUT /api/replacement - overwrite it. Body: `{ rows, review, envelope,
 * overrides }`. Override rules are expanded against the current corpus here,
 * so the client never sends their rows. The previous file is rotated to
 * `.bak` first. Responds with `warnings` about rules that matched nothing or
 * cancel each other out.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import {
  loadSupersessions,
  saveSupersessions,
} from '$lib/services/supersession-service';
import { parseOverrideRules } from '$lib/engine/supersession';
import type { ReviewItem, SupersessionRow } from '$lib/engine/supersession';

export const GET = apiHandler(async () => json(await loadSupersessions()));

export const PUT = apiHandler(async ({ request }) => {
  const payload = await parseJsonObject(request);
  if (!Array.isArray(payload.rows))
    throw badRequest('Expected a "rows" array.');

  const result = await saveSupersessions({
    rows: payload.rows as SupersessionRow[],
    review: Array.isArray(payload.review)
      ? (payload.review as ReviewItem[])
      : [],
    envelope: (payload.envelope ?? {}) as Record<string, unknown>,
    overrides: parseOverrideRules(payload.overrides),
  });
  return json({ saved: true, ...result });
});
