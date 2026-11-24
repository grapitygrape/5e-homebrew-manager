import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkGuideLists } from '$lib/services/guide-list-service';

export const GET: RequestHandler = async () => {
  return json(await checkGuideLists(false));
};

export const POST: RequestHandler = async () => {
  return json(await checkGuideLists(true));
};
