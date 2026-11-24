import { json } from '@sveltejs/kit';
import { apiHandler } from '$lib/server/http';
import { listItemsByProp } from '$lib/services/content-index-service';

export const GET = apiHandler(async ({ params }) => {
  const type = params.type ?? '';
  const bySource = await listItemsByProp(type);
  const count = Object.values(bySource).reduce((n, list) => n + list.length, 0);
  return json({ type, count, bySource });
});
