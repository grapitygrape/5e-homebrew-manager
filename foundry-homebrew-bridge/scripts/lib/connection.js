/**
 * lib/connection.js — which managers to connect to, and how to read the result.
 *
 * PURE, like match.js and inspect.js: no Foundry globals, so the manager's
 * Vitest suite imports it directly. bridge.js does the I/O.
 *
 * WHY SEVERAL URLS
 *   The desktop app runs its bridge on :5051, the dev server on :5173. They
 *   are separate processes with separate world lists, so a world pointed at
 *   one is invisible to the other. Connecting to both by default means
 *   whichever is running sees the world, with nothing to configure.
 */

/** The desktop app's bridge, then the dev server. */
export const DEFAULT_MANAGER_URLS = 'http://localhost:5051, http://localhost:5173';

/** The single-URL default 1.0.0 shipped with; migrated to the list above. */
export const LEGACY_DEFAULT_URL = 'http://localhost:5173';

/** Reconnect delays, ms, by consecutive failures. */
export const BACKOFF = [1000, 2000, 5000, 10000, 30000];

/** A refused world retries at this pace, so clicking Allow takes effect quickly. */
export const REFUSED_RETRY_MS = 5000;

/**
 * `"http://a:1/, http://b:2"` → `['http://a:1', 'http://b:2']`. Commas or
 * whitespace separate; trailing slashes go (they'd double up in `${base}/api`);
 * duplicates and non-http(s) entries are dropped.
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseManagerUrls(value) {
  const out = [];
  for (const raw of String(value ?? '').split(/[\s,]+/)) {
    const url = raw.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^/]/i.test(url)) continue;
    if (!out.some((u) => u.toLowerCase() === url.toLowerCase())) out.push(url);
  }
  return out;
}

/** Most useful first: one live connection is all a check needs. */
const STATUS_RANK = ['busy', 'connected', 'refused', 'connecting', 'error', 'offline'];

/**
 * One status for the whole bridge from each connection's.
 * @param {string[]} statuses
 * @returns {string} 'disconnected' when there are none
 */
export function aggregateStatus(statuses) {
  for (const status of STATUS_RANK) {
    if (statuses.includes(status)) return status;
  }
  return 'disconnected';
}

/**
 * How long to wait before the next attempt.
 * @param {'refused'|'offline'|'error'} kind what the last attempt found
 * @param {number} failures consecutive failures, counting this one
 */
export function retryDelay(kind, failures) {
  if (kind === 'refused') return REFUSED_RETRY_MS;
  return BACKOFF[Math.min(Math.max(failures, 1) - 1, BACKOFF.length - 1)];
}

/**
 * What a probe of `/api/foundry/status` says about a failed stream.
 * @param {{ status?: number, body?: { message?: string } | null, error?: string }} probe
 *   `status`/`body` when the request completed, `error` when it didn't
 * @returns {{ kind: 'ok'|'refused'|'offline'|'error', message: string }}
 */
export function readProbe(probe) {
  if (probe.error !== undefined)
    return { kind: 'offline', message: probe.error };
  if (probe.status === 403)
    return {
      kind: 'refused',
      message: probe.body?.message ?? 'The manager refused this origin.',
    };
  if (probe.status && probe.status >= 200 && probe.status < 300)
    return { kind: 'ok', message: '' };
  return { kind: 'error', message: `HTTP ${probe.status}` };
}
