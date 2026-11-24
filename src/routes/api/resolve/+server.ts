/**
 * POST /api/resolve — the final entity after `_copy`, `_mod`, `_templates`,
 * and `_versions`, applied exactly as the site applies them, with a trace.
 *
 * Body:
 *   { type, entityIdx, doc, file? }  — entity `doc[type][entityIdx]`; `doc`
 *                                      overlays the corpus so unsaved parents
 *                                      resolve (the Parser's shape)
 *
 *   → { type, raw, resolved, hasCopy, chain, trace: { steps, errors,
 *       warnings }, versions: [{ entity, trace }] }
 *
 * Trace steps say what happened to each prop: inherited, dropped for lack of
 * `_preserve` (with the fix), deleted by `null`, set by a template, or changed
 * by a `_mod` (failed mods carry `ok: false` and the reason). See
 * engine/merge/copy-applier.ts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { entityAt, resolvePreview } from '$lib/services/preview-service';

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Body must be JSON');
  }
  const type = typeof body.type === 'string' ? body.type : null;
  if (!type) throw error(400, 'Missing type');
  const doc =
    body.doc && typeof body.doc === 'object' && !Array.isArray(body.doc)
      ? (body.doc as Record<string, unknown>)
      : undefined;
  const entity = entityAt(doc, type, body.entityIdx);
  if (!entity) throw error(400, 'Expected { type, entityIdx, doc }');
  return json(
    await resolvePreview({
      type,
      entity,
      doc,
      file: typeof body.file === 'string' ? body.file : undefined,
    }),
  );
};
