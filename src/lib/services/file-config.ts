/**
 * lib/services/file-config.ts — ConfigProvider over `hbm-config.json` for
 * environments without `node:fs` (the Tauri webview).
 *
 * Holds an in-memory snapshot refreshed on mtime change. When `io` is provided
 * (desktop mode), reads and writes delegate to Rust's Mutex-guarded atomic
 * `read_config` / `save_config` commands so JS and Rust never race.
 */
import { fs, path } from '$lib/fs';
import {
  loadConfig,
  mergeStoredConfig,
  resolveStoredConfig,
  resolveStoredAppSettings,
  serializeStoredConfig,
} from '$lib/data';
import type { DataSourceConfig, StoredConfig } from '$lib/data';
import type { ConfigProvider } from './config';

export interface FileConfigIo {
  read: () => Promise<StoredConfig>;
  save: (patch: StoredConfig) => Promise<StoredConfig>;
}

export interface FileConfigProvider extends ConfigProvider {
  readonly configPath: string;
  /** Re-read the file if it changed. True when the snapshot changed. */
  refresh(): Promise<boolean>;
}

const MISSING = -1;

export function createFileConfigProvider(
  configPath: string,
  defaults: Partial<DataSourceConfig> = {},
  io?: FileConfigIo,
): FileConfigProvider {
  const base = { ...loadConfig(), ...defaults };
  let stored: StoredConfig = {};
  // null until the first refresh, so that one always reports a change.
  let seenMtime: number | null = null;

  const readStored = async (): Promise<StoredConfig> => {
    try {
      if (io) return (await io.read()) ?? {};
      return JSON.parse(await fs().readText(configPath)) as StoredConfig;
    } catch {
      return {};
    }
  };

  return {
    configPath,
    effectiveConfig: () => resolveStoredConfig(stored, base),
    effectiveAppSettings: () => resolveStoredAppSettings(stored.app),
    root: () => path.dirname(configPath),
    storePath: () => configPath,
    stored: () => stored,
    async save(cfg, app, extra) {
      if (io) {
        const patch: StoredConfig = { ...cfg, ...extra };
        if (app !== undefined) patch.app = app;
        stored = await io.save(patch);
        const st = await fs()
          .stat(configPath)
          .catch(() => null);
        seenMtime = st?.mtimeMs ?? seenMtime;
        return;
      }
      // Merge over the file, not the snapshot: Rust writes `repos` to it too.
      const next = mergeStoredConfig(await readStored(), cfg, app, extra);
      // A first run has no app-config folder yet.
      await fs().mkdir(path.dirname(configPath));
      await fs().writeText(configPath, serializeStoredConfig(next));
      stored = next;
      seenMtime = (await fs().stat(configPath)).mtimeMs;
    },
    async refresh() {
      const st = await fs()
        .stat(configPath)
        .catch(() => null);
      const mtime = st?.mtimeMs ?? MISSING;
      if (mtime === seenMtime) return false;
      seenMtime = mtime;
      stored = st ? await readStored() : {};
      return true;
    },
  };
}
