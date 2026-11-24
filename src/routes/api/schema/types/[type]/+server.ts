import { json } from '@sveltejs/kit';
import { apiHandler, notFound } from '$lib/server/http';
import { getTypeSchema } from '$lib/services/schema-service';

export const GET = apiHandler(async ({ params }) => {
  const type = params.type ?? '';
  const payload = await getTypeSchema(type);
  if (!payload) throw notFound(`No schema declared for type: ${type}`);
  return json(payload);
});
