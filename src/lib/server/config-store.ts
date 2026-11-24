/**
 * lib/server/config-store.ts — persist and resolve `hbm-config.json` on the
 * Node server (`node:fs`). Precedence: stored file → env vars → DEFAULT_CONFIG.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  mergeStoredConfig,
  resolveStoredConfig,
  resolveStoredAppSettings,
  serializeStoredConfig,
} from '$lib/data';
import type { DataSourceConfig, AppSettings, StoredConfig } from '$lib/data';
import type { ConfigProvider } from '$lib/services/config';
import { resolveConfigPath } from './config-path';

let resolvedPath: string | null = null;
let atomicSeq = 0;

/** Looked up on first use, so importing this module (tests do) reads nothing. */
function configFile(): string {
  resolvedPath ??= path.resolve(
    resolveConfigPath({
      env: process.env,
      cwd: process.cwd(),
      platform: process.platform,
      home: homedir(),
      exists: existsSync,
    }),
  );
  return resolvedPath;
}

function loadStored(): StoredConfig {
  try {
    return JSON.parse(readFileSync(configFile(), 'utf8')) as StoredConfig;
  } catch {
    return {};
  }
}

function writeFileAtomic(filePath: string, text: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${++atomicSeq}.tmp`,
  );
  writeFileSync(tmp, text, 'utf8');
  try {
    renameSync(tmp, filePath);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** The active config: stored overrides on top of env/defaults. */
export function effectiveConfig(): DataSourceConfig {
  return resolveStoredConfig(loadStored());
}

/** The active app settings: stored overrides on top of env/defaults. */
export function effectiveAppSettings(): AppSettings {
  return resolveStoredAppSettings(loadStored().app);
}

/** Persist a full config (+ optional app settings) atomically while preserving repo locks. */
export function saveConfig(
  cfg: Partial<DataSourceConfig>,
  app?: AppSettings,
  extra?: Pick<StoredConfig, 'sourceRepos' | 'setup'>,
): void {
  const next = mergeStoredConfig(loadStored(), cfg, app, extra);
  writeFileAtomic(configFile(), serializeStoredConfig(next));
}

/** What lib/services reads config through on the Node server and in tests. */
export const nodeConfigProvider: ConfigProvider = {
  effectiveConfig,
  effectiveAppSettings,
  root: () => path.dirname(configFile()),
  storePath: configFile,
  stored: loadStored,
  save: async (cfg, app, extra) => saveConfig(cfg, app, extra),
};
