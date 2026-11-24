/**
 * POST /api/homebrew-deploy { file } — copy one brew into configured local
 * destinations (Foundry homebrew and/or Deployed homebrew), overwriting.
 * POST /api/homebrew-deploy { all: true } — the same for every brew in the
 * working folder.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  deployAllFromHomebrew,
  deployFromHomebrew,
} from '$lib/services/homebrew-deploy';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    file?: string;
    all?: boolean;
  };
  if (body.all) {
    try {
      const result = await deployAllFromHomebrew();
      return json(result, { status: result.copied.length ? 200 : 502 });
    } catch (e) {
      throw error(400, (e as Error).message);
    }
  }
  try {
    const result = await deployFromHomebrew(String(body.file ?? ''));
    return json(result, { status: result.copied.length ? 200 : 502 });
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
