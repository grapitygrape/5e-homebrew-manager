import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildOpenApiSpec } from '$lib/server/openapi';
import { requestOrigin } from '$lib/server/http';

export const GET: RequestHandler = ({ request, url }) =>
  json(buildOpenApiSpec(requestOrigin(request, url)));
