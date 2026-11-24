/**
 * lib/api/browser-url.ts — makes backend-reported URLs reachable from the
 * browser. The backend only knows `localhost`; when the manager is opened from
 * another machine (a NAS or a container host), that link would point at the
 * viewer's own computer, so it gets the hostname the page was loaded from.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function reachableFrom(url: string, pageHostname: string): string {
  if (!pageHostname || LOOPBACK.has(pageHostname)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!LOOPBACK.has(parsed.hostname)) return url;
  parsed.hostname = pageHostname;
  return parsed.href.replace(/\/$/, url.endsWith('/') ? '/' : '');
}

/** `reachableFrom` against the current page, or the URL unchanged outside a browser. */
export function reachableFromPage(url: string): string {
  if (typeof window === 'undefined' || !window.location) return url;
  return reachableFrom(url, window.location.hostname);
}
