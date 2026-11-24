import { json } from '@sveltejs/kit';
import { apiHandler, requireQueryParam } from '$lib/server/http';
import { listSourceItems } from '$lib/services/content-index-service';

export const GET = apiHandler(async ({ params, url }) => {
  const source = params.source ?? '';
  const type = requireQueryParam(url, 'type');
  const items = await listSourceItems(source, type);
  return json({ source, type, count: items.length, items });
});
