import { json, text } from '@sveltejs/kit';
import {
  apiHandler,
  badRequest,
  notFound,
  parseJsonObject,
} from '$lib/server/http';
import { getDataSource } from '$lib/services/datasource';
import {
  readHomebrewText,
  saveHomebrewText,
} from '$lib/services/homebrew-deploy';
import { retireFromLiveFolders } from '$lib/services/homebrew-library';
import { errorText } from '$lib/util';

export const GET = apiHandler(async ({ params, url, request }) => {
  const file = params.file ?? '';
  const wantRaw =
    url.searchParams.get('format') === 'raw' ||
    url.searchParams.get('raw') === '1' ||
    (request.headers.get('accept')?.includes('text/plain') ?? false);
  try {
    if (wantRaw) return text(await readHomebrewText(file));
    return json(await getDataSource().readHomebrew(file));
  } catch (e) {
    throw notFound(errorText(e));
  }
});

export const PUT = apiHandler(async ({ params, request }) => {
  const file = params.file ?? '';
  const body = await parseJsonObject(request);
  if (typeof body.text !== 'string') throw badRequest('Missing "text" string.');
  try {
    return json(await saveHomebrewText(file, body.text));
  } catch (e) {
    throw badRequest(errorText(e));
  }
});

export const DELETE = apiHandler(async ({ params }) => {
  const file = params.file ?? '';
  try {
    const result = await retireFromLiveFolders(file);
    return json(result, { status: result.done.length ? 200 : 502 });
  } catch (e) {
    throw badRequest(errorText(e));
  }
});
