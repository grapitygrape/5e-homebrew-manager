import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import {
  deployAllFromHomebrew,
  deployFromHomebrew,
} from '$lib/services/homebrew-deploy';
import { errorText } from '$lib/util';

export const POST = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request);
  try {
    const result = body.all
      ? await deployAllFromHomebrew()
      : await deployFromHomebrew(String(body.file ?? ''));
    return json(result, { status: result.copied.length ? 200 : 502 });
  } catch (e) {
    throw badRequest(errorText(e));
  }
});
