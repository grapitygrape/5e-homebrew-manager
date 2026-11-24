/**
 * GET  /api/homebrew-library[?all=1] — every repo brew, with authors, date, size.
 * GET  /api/homebrew-library?folder=<type>&file=<name> — one repo brew's JSON.
 * POST /api/homebrew-library { action: 'add', folder, file } — copy a repo brew
 *      into the working + Deployed homebrew folders and list it in index.json.
 * POST /api/homebrew-library { action: 'remove', file } — move a brew into each
 *      folder's unused/ and drop it from index.json.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  addToLiveFolders,
  listLibrary,
  readLibraryFile,
  repoDir,
  retireFromLiveFolders,
} from '$lib/services/homebrew-library';

export const GET: RequestHandler = async ({ url }) => {
  let dir: string;
  try {
    dir = repoDir();
  } catch (e) {
    throw error(400, (e as Error).message);
  }
  const file = url.searchParams.get('file');
  try {
    if (file)
      return json(
        await readLibraryFile(url.searchParams.get('folder') ?? '', file, dir),
      );
    return json(await listLibrary(dir));
  } catch (e) {
    throw error(404, (e as Error).message);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    folder?: string;
    file?: string;
  };
  if (body.action !== 'add' && body.action !== 'remove')
    throw error(400, 'Unknown action');
  try {
    const result =
      body.action === 'add'
        ? await addToLiveFolders(
            String(body.folder ?? ''),
            String(body.file ?? ''),
          )
        : await retireFromLiveFolders(String(body.file ?? ''));
    return json(result, { status: result.done.length ? 200 : 502 });
  } catch (e) {
    throw error(400, (e as Error).message);
  }
};
