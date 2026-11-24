/**
 * GET  /api/homebrew-index — what the working homebrew folder and its
 *      index.json disagree on (see services/homebrew-index).
 * POST /api/homebrew-index { action: 'keep' | 'unused' | 'restore' | 'drop', file }
 *      — settle one of those the way the user chose.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  checkIndex,
  resolveMismatch,
  type MismatchAction,
} from '$lib/services/homebrew-index';

const ACTIONS: MismatchAction[] = ['keep', 'unused', 'restore', 'drop'];

export const GET: RequestHandler = async () => {
  try {
    return json(await checkIndex());
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    file?: string;
  };
  const action = body.action as MismatchAction;
  if (!ACTIONS.includes(action)) throw error(400, 'Unknown action');
  try {
    await resolveMismatch(action, String(body.file ?? ''));
    return json({ ok: true });
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
