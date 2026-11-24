/**
 * lib/services/config.ts — where services get the active config from.
 *
 * INTENT
 *   lib/services runs on the Node server and in the Tauri webview, but only
 *   Node can read hbm-config.json synchronously. So, like lib/fs, whoever boots
 *   the runtime registers a provider: hooks.server.ts and the Vitest setup
 *   register config-store's, the desktop shell registers a file-config one
 *   (file-config.ts) that it refreshes before each call.
 */
import type { DataSourceConfig, AppSettings, StoredConfig } from '$lib/data';

export interface ConfigProvider {
  effectiveConfig(): DataSourceConfig;
  effectiveAppSettings(): AppSettings;
  /** Absolute folder that relative source paths (`./guides`) resolve against. */
  root(): string;
  /** Absolute path of hbm-config.json, for display. */
  storePath(): string;
  /** hbm-config.json as stored, for keys outside the sources and app settings. */
  stored(): StoredConfig;
  /** Persist a save, keeping `repos` and any other stored keys. */
  save(
    cfg: Partial<DataSourceConfig>,
    app?: AppSettings,
    extra?: Pick<StoredConfig, 'sourceRepos' | 'setup'>,
  ): Promise<void>;
}

let current: ConfigProvider | null = null;

export function setConfigProvider(provider: ConfigProvider): void {
  current = provider;
}

export function configProvider(): ConfigProvider {
  if (!current)
    throw new Error(
      'No config provider registered - call setConfigProvider() first.',
    );
  return current;
}
