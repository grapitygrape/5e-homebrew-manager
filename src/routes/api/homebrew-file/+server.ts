/**
 * GET /api/homebrew-file?file=<name> — one homebrew file's parsed JSON.
 * GET /api/homebrew-file?file=<name>&raw=1 — its text as it is on disk.
 * POST /api/homebrew-file { file, text } — overwrite that working-folder brew.
 * Used by the Parser's deep link (/parser?file=) to load and save a file.
 */
import { json, error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDataSource } from '$lib/services/datasource';
import {
  readHomebrewText,
  saveHomebrewText,
} from '$lib/services/homebrew-deploy';

export const GET: RequestHandler = async ({ url }) => {
  const file = url.searchParams.get('file');
  if (!file) throw error(400, 'Missing file parameter');
  try {
    if (url.searchParams.get('raw')) return text(await readHomebrewText(file));
    return json(await getDataSource().readHomebrew(file));
  } catch (e) {
    throw error(404, (e as Error).message);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    file?: string;
    text?: string;
  };
  if (typeof body.text !== 'string') throw error(400, 'Missing text');
  try {
    return json(await saveHomebrewText(String(body.file ?? ''), body.text));
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
