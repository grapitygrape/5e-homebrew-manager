/**
 * lib/server/backend.ts — HTTP proxy and RPC client talking to the local
 * headless `hm-backend` Rust process (`127.0.0.1:5059` by default).
 */
import type {
  BridgeClientInfo,
  BridgeResult,
  FoundryCommandInput,
  FoundryQuery,
} from '$lib/engine/foundry/types.ts';

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:5059';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

export function backendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HBM_BACKEND_URL?.trim();
  if (!raw || raw === 'none') return DEFAULT_BACKEND_URL;
  return raw.replace(/\/+$/, '');
}

export async function isBackendReachable(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const raw = env.HBM_BACKEND_URL?.trim();
  if (raw === 'none') return false;
  if (raw || env.HBM_CONTAINER === '1') return true;
  try {
    const res = await fetch(`${DEFAULT_BACKEND_URL}/internal/health`, {
      signal: AbortSignal.timeout(250),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const PROXIED_FOUNDRY_PATHS = new Set([
  '/api/foundry/stream',
  '/api/foundry/result',
  '/api/foundry/state',
  '/api/foundry/status',
]);

export function isProxiedBackendPath(pathname: string): boolean {
  if (pathname === '/api/events' || pathname === '/api/modules') return true;
  if (PROXIED_FOUNDRY_PATHS.has(pathname)) return true;
  return (
    pathname.startsWith('/api/rpc/') ||
    pathname.startsWith('/api/repos/') ||
    pathname.startsWith('/api/modules/') ||
    pathname.startsWith('/api/pipeline/') ||
    pathname.startsWith('/api/setup/') ||
    pathname.startsWith('/api/server/')
  );
}

export async function proxyToBackend(
  request: Request,
  url: URL,
): Promise<Response> {
  const target = `${backendUrl()}${url.pathname}${url.search}`;
  const headers = new Headers();
  for (const [k, v] of request.headers.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
      headers.set(k, v);
    }
  }
  if (!headers.has('x-forwarded-host')) {
    headers.set(
      'x-forwarded-host',
      request.headers.get('host') || url.host,
    );
  }
  if (!headers.has('x-forwarded-proto')) {
    headers.set('x-forwarded-proto', url.protocol.replace(/:$/, ''));
  }

  const hasBody =
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    request.method !== 'OPTIONS';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error Node fetch requires duplex: 'half' for ReadableStream request bodies
      duplex: hasBody ? 'half' : undefined,
    });

    const outHeaders = new Headers();
    for (const [k, v] of upstream.headers.entries()) {
      if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) {
        outHeaders.set(k, v);
      }
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  } catch (err) {
    const msg = `hm-backend is not reachable at ${backendUrl()} (${(err as Error).message}). Start it with "npm run dev:web" or "cargo run -p hm-backend".`;
    return new Response(
      JSON.stringify({
        message: msg,
        error: { code: 'BACKEND_UNAVAILABLE', message: msg },
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
}

export async function backendRpc<T>(
  cmd: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(`${backendUrl()}/api/rpc/${cmd}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ??
        body?.message ??
        `hm-backend ${cmd} failed (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

export async function listClients(): Promise<BridgeClientInfo[]> {
  const status = await backendRpc<{ clients: BridgeClientInfo[] }>(
    'foundry_status',
  );
  return status.clients ?? [];
}

export async function ask(
  clientId: string,
  query: Omit<FoundryQuery, 'requestId'>,
): Promise<BridgeResult> {
  return backendRpc<BridgeResult>('foundry_ask', { clientId, query });
}

export async function command(
  clientId: string,
  cmd: FoundryCommandInput,
): Promise<BridgeResult> {
  return backendRpc<BridgeResult>('foundry_command', {
    clientId,
    command: cmd,
  });
}
