import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  completeSetup,
  setupCompleted,
  setupDraft,
  type SetupDraft,
} from '$lib/services/setup-service';

export const GET: RequestHandler = () => {
  return json({
    completed: setupCompleted(),
    draft: setupDraft(),
  });
};

export const POST: RequestHandler = async ({ request }) => {
  let body: { draft?: SetupDraft };
  try {
    body = (await request.json()) as { draft?: SetupDraft };
  } catch {
    throw error(400, 'Body must be JSON.');
  }
  if (!body?.draft?.repos) {
    throw error(400, 'Missing setup draft.');
  }
  await completeSetup(body.draft);
  return json({ ok: true });
};
