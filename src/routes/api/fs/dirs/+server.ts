/**
 * GET /api/fs/dirs?path=... — jailed directory browser for web/container mode
 * when native OS folder dialogs (`rfd`) are unavailable.
 *
 * In container mode (`HBM_CONTAINER=1`), browsing is strictly jailed to `/data`
 * and `/foundry-data` (plus any comma-separated roots in `HBM_FS_ROOTS`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const slash = (p: string): string => p.replace(/\\/g, '/');

function normalizeAbs(p: string): string {
  const s = slash(p.trim());
  if (s.startsWith('/')) {
    return path.posix.normalize(s).replace(/\/+$/, '') || '/';
  }
  return slash(path.resolve(p)).replace(/\/+$/, '');
}

export function _allowedBrowseRoots(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string[] {
  const custom = (env.HBM_FS_ROOTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (custom.length > 0) {
    return custom.map((r) => normalizeAbs(r));
  }
  if (env.HBM_CONTAINER === '1') {
    return ['/data', '/foundry-data'];
  }
  return [slash(path.resolve(cwd, '..')), slash(path.resolve(cwd))];
}

export function _isWithinRoots(target: string, roots: string[]): boolean {
  const norm = normalizeAbs(target);
  return roots.some((root) => {
    const r = normalizeAbs(root);
    return norm === r || norm.startsWith(`${r}/`);
  });
}

export const GET: RequestHandler = ({ url }) => {
  const roots = _allowedBrowseRoots();
  const requested = url.searchParams.get('path')?.trim() || roots[0];
  const resolved = normalizeAbs(requested);

  if (!_isWithinRoots(resolved, roots)) {
    throw error(
      403,
      `Path "${requested}" is outside the allowed browse roots (${roots.join(', ')}).`,
    );
  }

  let dirs: { name: string; path: string }[] = [];
  if (fs.existsSync(resolved)) {
    try {
      dirs = fs
        .readdirSync(resolved, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({
          name: d.name,
          path: `${resolved.replace(/\/+$/, '')}/${d.name}`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      dirs = [];
    }
  }

  const parentCandidate = resolved.startsWith('/')
    ? path.posix.dirname(resolved)
    : slash(path.dirname(resolved));
  const parent =
    parentCandidate !== resolved && _isWithinRoots(parentCandidate, roots)
      ? parentCandidate
      : null;

  return json({
    path: resolved,
    parent,
    roots,
    dirs,
  });
};
