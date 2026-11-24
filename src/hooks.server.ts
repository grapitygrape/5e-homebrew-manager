/**
 * hooks.server.ts — registers the Node filesystem adapter and config provider,
 * enforces optional HTTP Basic Auth (`HBM_AUTH_USER` / `HBM_AUTH_PASS`),
 * proxies `/api/{rpc,repos,modules,pipeline,setup,server,events}` and
 * `/api/foundry/{stream,result,state,status}` to `hm-backend` (`127.0.0.1:5059`),
 * and enforces CORS on `/api/foundry/*` routes against Settings → Foundry URL.
 */
import type { Handle } from '@sveltejs/kit';
import { setFs } from '$lib/fs';
import { nodeFsAdapter } from '$lib/server/node-fs';
import { setConfigProvider } from '$lib/services/config';
import {
  effectiveAppSettings,
  nodeConfigProvider,
} from '$lib/server/config-store';
import { isProxiedBackendPath, proxyToBackend } from '$lib/server/backend';
import { requestOrigin } from '$lib/server/http';
import { setBundledBridgeDir } from '$lib/services/bridge-deploy';
import { join } from '$lib/fs/path';

setFs(nodeFsAdapter);
setConfigProvider(nodeConfigProvider);
// The Node server runs from the project root, where the module lives.
setBundledBridgeDir(join(process.cwd(), 'foundry-homebrew-bridge'));

const BRIDGE_PREFIX = '/api/foundry';

/**
 * Endpoints exempt from Manager HTTP Basic Auth (`HBM_AUTH_USER` / `HBM_AUTH_PASS`):
 * - `/api/health`: Docker container healthcheck probe
 * - `/api/foundry/{stream,result,state,status}`: Foundry bridge (protected by
 *   origin allowlist + optional `HBM_BRIDGE_TOKEN`)
 * - `/api/bridge/{module.json,foundry-homebrew-bridge.zip}`: Foundry manifest installer
 */
export function isBasicAuthExempt(pathname: string): boolean {
  return (
    pathname === '/api/health' ||
    pathname === '/api/foundry/stream' ||
    pathname === '/api/foundry/result' ||
    pathname === '/api/foundry/state' ||
    pathname === '/api/foundry/status' ||
    pathname === '/api/bridge/module.json' ||
    pathname === '/api/bridge/foundry-homebrew-bridge.zip'
  );
}

export function checkBasicAuth(
  request: Request,
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): Response | null {
  const user = env.HBM_AUTH_USER?.trim() ?? '';
  const pass = env.HBM_AUTH_PASS?.trim() ?? '';
  if (!user || !pass || isBasicAuthExempt(pathname)) return null;

  const expected = `Basic ${Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')}`;
  const provided = request.headers.get('authorization')?.trim() ?? '';
  if (provided === expected) return null;

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="5e Homebrew Manager", charset="UTF-8"',
    },
  });
}

function allowedOrigins(): Set<string> {
  const out = new Set<string>();
  for (const raw of effectiveAppSettings().foundryUrls) {
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') out.add(u.origin);
    } catch {
      // Malformed entry in settings — ignore rather than crash every request.
    }
  }
  return out;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export const handle: Handle = async ({ event, resolve }) => {
  const { url, request } = event;

  const authChallenge = checkBasicAuth(request, url.pathname);
  if (authChallenge) return authChallenge;

  if (isProxiedBackendPath(url.pathname)) {
    return proxyToBackend(request, url);
  }

  if (!url.pathname.startsWith(BRIDGE_PREFIX)) return resolve(event);

  const origin = request.headers.get('origin');
  const sameOrigin = !origin || origin === requestOrigin(request, url);
  const allowed = sameOrigin || allowedOrigins().has(origin);

  // Preflight for the bridge's JSON POST.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: allowed ? 204 : 403,
      headers: allowed && origin ? corsHeaders(origin) : {},
    });
  }

  if (!allowed) {
    return new Response(
      JSON.stringify({
        message:
          `Origin ${origin} is not allowed. Click Allow next to the Foundry ` +
          `badge on the manager's Files page, or add it to Settings → Foundry URL.`,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      },
    );
  }

  const response = await resolve(event);
  if (origin && !sameOrigin) {
    for (const [k, v] of Object.entries(corsHeaders(origin)))
      response.headers.set(k, v);
  }
  return response;
};
