import type { RequestHandler } from './$types';
import { buildBridgeManifest } from '$lib/server/bridge-package';
import { apiHandler, requestOrigin } from '$lib/server/http';

export const GET: RequestHandler = apiHandler(async ({ request, url }) => {
  const origin = requestOrigin(request, url);
  const manifest = await buildBridgeManifest(origin);
  return new Response(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  });
});
