/**
 * lib/api/desktop.ts — boots lib/services inside the Tauri webview.
 *
 * Every API function checks `desktopReady()`. In a plain browser tab it returns
 * false and falls back to `/api/*`. In the desktop shell the first call wires
 * the Tauri filesystem and an `hbm-config.json` provider backed by Rust's
 * atomic `read_config` / `save_config` commands, then throttles mtime checks.
 */
import { invoke } from '@tauri-apps/api/core';
import type { StoredConfig } from '$lib/data';
import { setFs } from '$lib/fs';
import { tauriFsAdapter } from '$lib/fs/tauri-fs';
import { isTauri } from './tauri-core';
import { getBundledBridgeDir, getBundledGuidesDir } from './desktop-shell';
import { setConfigProvider } from '$lib/services/config';
import {
  createFileConfigProvider,
  type FileConfigProvider,
} from '$lib/services/file-config';
import { onDataSourceReset, resetDataSource } from '$lib/services/datasource';
import { setBundledBridgeDir } from '$lib/services/bridge-deploy';

const CONFIG_CHECK_TTL_MS = 1500;

let booting: Promise<FileConfigProvider> | null = null;
let lastCheckedAt = 0;
let refreshInFlight: Promise<boolean> | null = null;

onDataSourceReset(() => {
  lastCheckedAt = 0;
});

async function boot(): Promise<FileConfigProvider> {
  setFs(tauriFsAdapter);
  const [configPath, guides, bridge] = await Promise.all([
    invoke<string>('get_config_path'),
    getBundledGuidesDir(),
    getBundledBridgeDir(),
  ]);
  setBundledBridgeDir(bridge);
  const provider = createFileConfigProvider(
    configPath,
    guides ? { guides: { path: guides } } : {},
    {
      read: () => invoke<StoredConfig>('read_config'),
      save: (patch) => invoke<StoredConfig>('save_config', { patch }),
    },
  );
  setConfigProvider(provider);
  return provider;
}

/**
 * True in the desktop shell once services are wired to `hbm-config.json`.
 * Config mtime checks are throttled (and deduplicated across concurrent calls)
 * so burst IPC calls don't each stat the file; `resetDataSource()` resets the
 * window immediately.
 */
export async function desktopReady(): Promise<boolean> {
  if (!isTauri()) return false;
  if (!booting) {
    booting = boot().catch((err) => {
      booting = null;
      throw err;
    });
  }
  const provider = await booting;
  const now = Date.now();
  if (lastCheckedAt > 0 && now - lastCheckedAt < CONFIG_CHECK_TTL_MS) {
    return true;
  }
  if (!refreshInFlight) {
    refreshInFlight = provider
      .refresh()
      .then((changed) => {
        lastCheckedAt = Date.now();
        if (changed) resetDataSource();
        return changed;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  await refreshInFlight;
  return true;
}

export { fetchOk, postJson } from './transport';
