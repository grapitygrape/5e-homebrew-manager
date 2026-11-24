import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import {
  checkIndex,
  resolveMismatch,
  type MismatchAction,
} from '$lib/services/homebrew-index';
import { errorText } from '$lib/util';

const ACTIONS: MismatchAction[] = ['keep', 'unused', 'restore', 'drop'];

export const GET = apiHandler(async () => {
  try {
    return json(await checkIndex());
  } catch (e) {
    throw badRequest(errorText(e));
  }
});

export const POST = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request);
  const action = body.action as MismatchAction;
  if (!ACTIONS.includes(action)) throw badRequest('Unknown action.');
  try {
    await resolveMismatch(action, String(body.file ?? ''));
    return json({ ok: true });
  } catch (e) {
    throw badRequest(errorText(e));
  }
});
