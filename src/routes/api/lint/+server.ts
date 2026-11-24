/**
 * Submission lint — the homebrew repo's CI rules, run locally.
 *
 * GET  /api/lint?file=<name>                 lint a homebrew file on disk
 * POST /api/lint { file, doc?, raw? }        lint an edited/unsaved document
 *   (`raw` is the editor text; enables the formatting checks)
 *
 *   → { lint: { file, issues, folder, totals }, collisions: Collision[] }
 *
 * Each issue names its rule id and, where CI enforces it, the repo npm script
 * that would fail (`ci: "test:clean"`, …). See engine/audit/submission-lint.ts.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkSubmission } from '$lib/services/brew-check-service';

export const GET: RequestHandler = async ({ url }) => {
  const file = url.searchParams.get('file');
  if (!file) throw error(400, 'Missing file parameter');
  try {
    return json(await checkSubmission(file));
  } catch (e) {
    throw error(404, (e as Error).message);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  let body: { file?: unknown; doc?: unknown; raw?: unknown };
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Body must be JSON');
  }
  const file = typeof body.file === 'string' && body.file ? body.file : null;
  const raw = typeof body.raw === 'string' ? body.raw : undefined;
  let doc =
    body.doc && typeof body.doc === 'object' && !Array.isArray(body.doc)
      ? (body.doc as Record<string, unknown>)
      : undefined;
  if (!doc && raw) {
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      throw error(400, `raw is not valid JSON: ${(e as Error).message}`);
    }
  }
  if (!file && !doc)
    throw error(400, 'Expected { file } or { file, doc | raw }');
  return json(await checkSubmission(file ?? 'Untitled.json', doc, raw));
};
