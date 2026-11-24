/**
 * scripts/lib/config.ts — the config and schema-directory helpers the CLI
 * scripts read.
 *
 * Finds hbm-config.json the way the app does (HBM_CONFIG_PATH, then the
 * app-config folder, then the repo copy), so a script checks the same
 * checkouts the app uses. Relative paths resolve against the config's folder,
 * as the app's config provider does.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/lib/data/config.ts';
import type { SchemaMap } from '../../src/lib/engine/audit/schema.ts';
import { resolveConfigPath } from '../../src/lib/server/config-path.ts';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

type SourceKey = 'data' | 'schema' | 'guides';
type SourceRef = { path?: string; url?: string };

export const storePath = path.resolve(
  resolveConfigPath({
    env: process.env,
    cwd: ROOT,
    platform: process.platform,
    home: os.homedir(),
    exists: fs.existsSync,
  }),
);

/** hbm-config.json as stored; {} when there isn't one (env/defaults still apply). */
export const stored: Record<string, unknown> = (() => {
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    return {};
  }
})();

const base = loadConfig();

/** A source's local folder, or why there isn't one. */
export function localSource(
  key: SourceKey,
): { dir: string } | { problem: string } {
  const ref = (stored[key] as SourceRef | undefined) ?? base[key];
  if (ref?.url)
    return {
      problem: `${key} is configured as a URL (${ref.url}); this script needs a local path.`,
    };
  if (!ref?.path) return { problem: `no ${key} path configured.` };
  const dir = path.isAbsolute(ref.path)
    ? ref.path
    : path.resolve(path.dirname(storePath), ref.path);
  if (!fs.existsSync(dir))
    return { problem: `${key} path does not exist: ${dir}` };
  return { dir };
}

/**
 * Resolve a required local source folder, or exit cleanly: 0 when
 * `--if-configured` is set (so `npm run verify` stays green on fresh clones),
 * else 2 with an explanation.
 */
export function requireLocalSource(
  key: SourceKey,
  opts: { ifConfigured: boolean; skipLabel: string; hint?: string },
): string {
  const found = localSource(key);
  if ('dir' in found) return found.dir;
  if (opts.ifConfigured) {
    console.log(`- ${opts.skipLabel} skipped: ${found.problem}`);
    process.exit(0);
  }
  console.error(`✖ ${found.problem}`);
  if (opts.hint) console.error(`  ${opts.hint}`);
  process.exit(2);
}

/** Recursively load every `.json` file under `dir` into a posix-keyed SchemaMap. */
export function loadSchemaDir(
  dir: string,
  onBadJson?: (key: string) => void,
): { schemas: SchemaMap; badJson: number } {
  const schemas: SchemaMap = {};
  let badJson = 0;
  (function walk(cur: string, rel = ''): void {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      // Schema $refs are always posix-style, so build keys with '/' on every OS.
      const key = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(cur, e.name), key);
      else if (e.name.endsWith('.json')) {
        try {
          schemas[key] = JSON.parse(
            fs.readFileSync(path.join(cur, e.name), 'utf8'),
          );
        } catch {
          badJson++;
          onBadJson?.(key);
        }
      }
    }
  })(dir);
  return { schemas, badJson };
}
