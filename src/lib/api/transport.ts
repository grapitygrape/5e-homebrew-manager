/**
 * Shared client transport helpers for `lib/api/*`: dispatches to in-process
 * services / Tauri commands when running inside the Tauri desktop shell, or
 * HTTP `/api/*` and SSE `/api/events` in web/container mode.
 */
import { desktopReady } from './desktop';
import { isTauri, tauriCall, tauriListen, type UnlistenFn } from './tauri-core';

export type { UnlistenFn };

export async function rpc<T>(
  desktopFn: () => T | Promise<T>,
  httpFn: () => Promise<T>,
): Promise<T> {
  if (await desktopReady()) return desktopFn();
  return httpFn();
}

/**
 * Invoke a Rust backend command (`hm-core`), either via Tauri IPC on desktop
 * or via `POST /api/rpc/{cmd}` (proxied to `hm-backend`) in web/container mode.
 */
export async function backendCall<T>(
  cmd: string,
  args?: Record<string, unknown>,
  httpFn?: () => Promise<T>,
): Promise<T> {
  if (isTauri()) return tauriCall<T>(cmd, args);
  if (httpFn) return httpFn();
  return postJson<T>(`/api/rpc/${cmd}`, args ?? {});
}

let sharedEventSource: EventSource | null = null;
let activeListeners = 0;

/**
 * Subscribe to a backend event (`pipeline-event`, `setup-progress`,
 * `site-blocklist-added`, `site-shops-changed`) across Tauri IPC or web SSE (`/api/events`).
 */
export async function listenEvent<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  if (isTauri()) return tauriListen<T>(event, handler);
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  if (!sharedEventSource || sharedEventSource.readyState === EventSource.CLOSED) {
    sharedEventSource = new EventSource('/api/events');
  }
  const source = sharedEventSource;
  activeListeners += 1;

  const listener = (ev: MessageEvent) => {
    try {
      const payload = JSON.parse(ev.data) as T;
      handler(payload);
    } catch {
      // Ignore malformed SSE payloads
    }
  };

  source.addEventListener(event, listener as EventListener);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    source.removeEventListener(event, listener as EventListener);
    activeListeners = Math.max(0, activeListeners - 1);
    if (activeListeners === 0 && sharedEventSource === source) {
      source.close();
      sharedEventSource = null;
    }
  };
}

export async function fetchOk(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      error?: { message?: string };
    } | null;
    throw new Error(
      body?.error?.message ?? body?.message ?? `HTTP ${res.status} from ${url}`,
    );
  }
  return res;
}

export async function getJson<T>(url: string): Promise<T> {
  return (await (await fetchOk(url)).json()) as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchOk(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function putJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetchOk(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function deleteJson<T>(url: string): Promise<T> {
  const res = await fetchOk(url, { method: 'DELETE' });
  return (await res.json()) as T;
}
