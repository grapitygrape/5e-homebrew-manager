import type { RequestHandler } from './$types';
import { buildBridgeZipBuffer } from '$lib/server/bridge-package';
import { apiHandler, requestOrigin } from '$lib/server/http';

export const GET: RequestHandler = apiHandler(async ({ request, url }) => {
  const origin = requestOrigin(request, url);
  const zipBuffer = await buildBridgeZipBuffer(origin);
  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="foundry-homebrew-bridge.zip"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    },
  });
});
