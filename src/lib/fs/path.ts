/**
 * lib/fs/path.ts — the slice of node:path this app uses, safe for the browser.
 *
 * Accepts both separators, emits forward slashes only. Rust, Node and Windows
 * itself all take `C:/x/y`, so one form everywhere keeps comparisons simple.
 * Understands drive letters (`C:/`), UNC shares (`//server/share/`) and posix
 * roots. There is no cwd here: `resolve` with no absolute part stays relative,
 * so callers pass an absolute root first.
 */

/** Split a path into its root (`C:/`, `//host/share/`, `/`, or '') and the rest. */
function splitRoot(p: string): [string, string] {
  const s = p.replace(/\\/g, '/');
  const unc = /^\/\/[^/]+\/[^/]+/.exec(s);
  if (unc) return [`${unc[0]}/`, s.slice(unc[0].length)];
  const drive = /^[a-zA-Z]:\//.exec(s);
  if (drive) return [drive[0], s.slice(3)];
  if (s.startsWith('/')) return ['/', s.slice(1)];
  return ['', s];
}

export function isAbsolute(p: string): boolean {
  return splitRoot(p)[0] !== '';
}

/** Collapse separators, `.` and `..`. Never climbs above an absolute root. */
export function normalize(p: string): string {
  const [root, rest] = splitRoot(p);
  const out: string[] = [];
  for (const seg of rest.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else if (!root) out.push('..');
      continue;
    }
    out.push(seg);
  }
  return root + out.join('/') || '.';
}

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join('/'));
}

/** Right-to-left until an absolute part, like node's resolve minus the cwd. */
export function resolve(...parts: string[]): string {
  const taken: string[] = [];
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!parts[i]) continue;
    taken.unshift(parts[i]);
    if (isAbsolute(parts[i])) break;
  }
  return join(...taken);
}

export function dirname(p: string): string {
  const [root, rest] = splitRoot(normalize(p));
  const cut = rest.lastIndexOf('/');
  if (cut === -1) return root || '.';
  return root + rest.slice(0, cut);
}

export function basename(p: string): string {
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return s.slice(s.lastIndexOf('/') + 1);
}
