import { json } from '@sveltejs/kit';
import {
  apiHandler,
  badRequest,
  notFound,
  parseJsonObject,
} from '$lib/server/http';
import {
  addToLiveFolders,
  listLibrary,
  readLibraryFile,
  repoDir,
  retireFromLiveFolders,
} from '$lib/services/homebrew-library';
import { errorText } from '$lib/util';

export const GET = apiHandler(async ({ url }) => {
  let dir: string;
  try {
    dir = repoDir();
  } catch (e) {
    throw badRequest(errorText(e));
  }
  const file = url.searchParams.get('file');
  try {
    if (file) {
      return json(
        await readLibraryFile(url.searchParams.get('folder') ?? '', file, dir),
      );
    }
    return json(await listLibrary(dir));
  } catch (e) {
    throw notFound(errorText(e));
  }
});

export const POST = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request);
  if (body.action !== 'add' && body.action !== 'remove') {
    throw badRequest('Expected action "add" or "remove".');
  }
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
    throw badRequest(errorText(e));
  }
});
