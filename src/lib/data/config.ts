/**
 * data/config.ts — where the app looks for 5etools content, and how to set it.
 *
 * INTENT
 *   Bring-your-own-data. No copyrighted 5etools content is bundled; the user
 *   points each source at their own checkout (a path) or a mirror (a URL). One
 *   config shape (DataSourceConfig) serves every adapter. Env vars override the
 *   defaults so deployment needs no code edits.
 *
 * PRECEDENCE  env var → DEFAULT_CONFIG
 *   HBM_DATA_PATH / HBM_DATA_URL          → 5etools data dir
 *   HBM_SCHEMA_PATH / HBM_SCHEMA_URL      → brew schema root
 *   HBM_GUIDES_PATH / HBM_GUIDES_URL      → conversion guides
 *   HBM_HOMEBREW_PATH / HBM_HOMEBREW_URL  → homebrew .json folder
 *   HBM_PARTNERED_PATH                    → homebrew-repo checkout (partnered brews)
 *
 * DEFAULTS are placeholders only — they name no real checkout. Set the actual
 * locations in Settings (persisted to hbm-config.json) or via the env vars.
 */
import type { DataSourceConfig, SourceRef } from './source.ts';
import { dirname } from '../fs/path.ts';

export const DEFAULT_CONFIG: DataSourceConfig = {
  data: { path: './data-sources/data' },
  schema: { path: './data-sources/schema/brew' },
  guides: { path: './guides' },
  homebrew: { path: './data-sources/homebrew' },
  // Deliberately unset: partnered content is opt-in.
  partnered: {},
};

type EnvLike = Record<string, string | undefined>;

/** Build a SourceRef from a `*_PATH` / `*_URL` env pair, or fall back. */
function refFromEnv(env: EnvLike, key: string, fallback: SourceRef): SourceRef {
  const url = env[`HBM_${key}_URL`];
  const path = env[`HBM_${key}_PATH`];
  if (url) return { url };
  if (path) return { path };
  return fallback;
}

/** Resolve the active config from environment overrides layered on the defaults. */
export function loadConfig(
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): DataSourceConfig {
  return {
    data: refFromEnv(env, 'DATA', DEFAULT_CONFIG.data),
    schema: refFromEnv(env, 'SCHEMA', DEFAULT_CONFIG.schema),
    guides: refFromEnv(env, 'GUIDES', DEFAULT_CONFIG.guides),
    homebrew: refFromEnv(env, 'HOMEBREW', DEFAULT_CONFIG.homebrew),
    partnered: refFromEnv(env, 'PARTNERED', DEFAULT_CONFIG.partnered ?? {}),
  };
}

/** The git repos setup clones. `siteImages` and `images` are optional. */
// 'bridge' is off while the module is bundled in this repo.
export type SourceRepoId =
  'tools' | 'siteImages' | 'homebrew' | 'images' | 'utils'; // | 'bridge'

export interface SourceRepo {
  url: string;
  path: string;
}

export type SourceRepos = Partial<Record<SourceRepoId, SourceRepo>>;

/** Single-folder keys older configs used before the deploy lists. */
const LEGACY_APP_KEYS = [
  'foundryHomebrew',
  'deployedHomebrew',
  'deployTarget',
] as const;
type LegacyAppKeys = Partial<Record<(typeof LEGACY_APP_KEYS)[number], string>>;

/** `hbm-config.json` as written: any subset of the config, plus keys the app doesn't own. */
export type StoredConfig = Partial<DataSourceConfig> & {
  app?: Partial<AppSettings> & LegacyAppKeys;
  repos?: Record<string, unknown>;
  sourceRepos?: SourceRepos;
  setup?: { completedAt?: string };
  [key: string]: unknown;
};

/** Stored overrides on top of env/defaults. Node and the desktop shell share this. */
export function resolveStoredConfig(
  stored: StoredConfig,
  base: DataSourceConfig = loadConfig(),
): DataSourceConfig {
  return {
    data: stored.data ?? base.data,
    schema: stored.schema ?? base.schema,
    guides: stored.guides ?? base.guides,
    homebrew: stored.homebrew ?? base.homebrew,
    partnered: stored.partnered ?? base.partnered ?? {},
  };
}

/** Human-readable summary of a SourceRef, for Settings/diagnostics. */
export const describeRef = (ref: SourceRef): string =>
  ref.url ?? ref.path ?? '(unset)';

/** The sources the app cannot run without; `partnered` is opt-in. */
const REQUIRED_REFS = ['data', 'schema', 'guides', 'homebrew'] as const;

/**
 * True if every source is URL-based (⇒ a browser HttpDataSource can serve it).
 *
 * Checks the required refs by name rather than sweeping `Object.values`: the
 * optional `partnered` ref is normally unset, and an unset ref is not a path —
 * counting it as one would strand every all-URL config on the Fs adapter.
 */
export const isAllUrls = (cfg: DataSourceConfig): boolean =>
  REQUIRED_REFS.every((k) => !!cfg[k]?.url && !cfg[k]?.path) &&
  !cfg.partnered?.path;

/** Interpret a Settings text input as a SourceRef: `http(s)://…` → url, else path. Empty → {}. */
export function parseSourceInput(value: string): SourceRef {
  const v = value.trim();
  if (!v) return {};
  return /^https?:\/\//i.test(v) ? { url: v } : { path: v };
}

// --- app settings (link targets, not data sources) ---------------------------

/** Non-data-source settings: outbound link targets and Foundry integration. */
export interface AppSettings {
  /** Base URL of a 5etools instance — where content links (shop items, …) resolve. */
  toolsUrl: string;
  /** Base URLs of local Foundry VTT instances (one or more). */
  foundryUrls: string[];
  /** Folders that receive the whole site on deploy. */
  siteDeployFolders: string[];
  /** Folders that receive homebrew files on deploy (Foundry, a live site's homebrew/). */
  homebrewDeployFolders: string[];
  /**
   * Foundry's user data folder or its Data folder. The bundled bridge module
   * deploys into its modules/ folder.
   */
  foundryDataPath: string;
  /** Brew source code for the exported shop book. Schema requires >= 6 chars. */
  shopBookSource: string;
  /** Title of the exported shop book, shown in the 5etools nav. */
  shopBookName: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  toolsUrl: '',
  foundryUrls: [],
  siteDeployFolders: [],
  homebrewDeployFolders: [],
  foundryDataPath: '',
  shopBookSource: 'HBMShops',
  shopBookName: 'Shops',
};

/** Split a comma-separated URL list into trimmed, non-empty entries. */
export const parseUrlList = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Strip a trailing slash so `${base}/items.html#…` composes cleanly. */
export const trimBaseUrl = (url: string): string =>
  url.trim().replace(/\/+$/, '');

/**
 * Resolve app settings from environment overrides layered on the defaults.
 *   HBM_TOOLS_URL          → toolsUrl
 *   HBM_FOUNDRY_URLS       → foundryUrls (comma-separated)
 *   HBM_FOUNDRY_HOMEBREW   → homebrewDeployFolders (with the next one)
 *   HBM_DEPLOYED_HOMEBREW  → homebrewDeployFolders
 *   HBM_FOUNDRY_DATA       → foundryDataPath
 *   HBM_SHOP_BOOK_SOURCE   → shopBookSource
 *   HBM_SHOP_BOOK_NAME     → shopBookName
 */
export function loadAppSettings(
  env: EnvLike = typeof process !== 'undefined' ? process.env : {},
): AppSettings {
  return {
    toolsUrl: env.HBM_TOOLS_URL ?? DEFAULT_APP_SETTINGS.toolsUrl,
    foundryUrls: env.HBM_FOUNDRY_URLS
      ? parseUrlList(env.HBM_FOUNDRY_URLS)
      : DEFAULT_APP_SETTINGS.foundryUrls,
    siteDeployFolders: DEFAULT_APP_SETTINGS.siteDeployFolders,
    homebrewDeployFolders: nonEmpty([
      env.HBM_FOUNDRY_HOMEBREW,
      env.HBM_DEPLOYED_HOMEBREW,
    ]),
    foundryDataPath:
      env.HBM_FOUNDRY_DATA ?? DEFAULT_APP_SETTINGS.foundryDataPath,
    shopBookSource:
      env.HBM_SHOP_BOOK_SOURCE ?? DEFAULT_APP_SETTINGS.shopBookSource,
    shopBookName: env.HBM_SHOP_BOOK_NAME ?? DEFAULT_APP_SETTINGS.shopBookName,
  };
}

const nonEmpty = (values: (string | undefined)[]): string[] =>
  values.map((v) => (v ?? '').trim()).filter(Boolean);

/** The site list an older config implies: its deploy target, else the deployed homebrew's parent. */
function legacySiteFolders(stored: LegacyAppKeys): string[] | undefined {
  if (stored.deployTarget?.trim()) return [stored.deployTarget.trim()];
  if (stored.deployedHomebrew?.trim())
    return [dirname(stored.deployedHomebrew.trim())];
  return undefined;
}

function legacyHomebrewFolders(stored: LegacyAppKeys): string[] | undefined {
  const list = nonEmpty([stored.foundryHomebrew, stored.deployedHomebrew]);
  return list.length ? list : undefined;
}

/** Stored `app` overrides on top of env/defaults. Older single-folder keys fill the lists. */
export function resolveStoredAppSettings(
  stored: Partial<AppSettings> & LegacyAppKeys = {},
  base: AppSettings = loadAppSettings(),
): AppSettings {
  return {
    toolsUrl: stored.toolsUrl ?? base.toolsUrl,
    foundryUrls: stored.foundryUrls ?? base.foundryUrls,
    siteDeployFolders:
      stored.siteDeployFolders ??
      legacySiteFolders(stored) ??
      base.siteDeployFolders,
    homebrewDeployFolders:
      stored.homebrewDeployFolders ??
      legacyHomebrewFolders(stored) ??
      base.homebrewDeployFolders,
    foundryDataPath: stored.foundryDataPath ?? base.foundryDataPath,
    shopBookSource: stored.shopBookSource ?? base.shopBookSource,
    shopBookName: stored.shopBookName ?? base.shopBookName,
  };
}

/**
 * A Settings save over what's stored. Keys Settings doesn't own (`repos`, which
 * the Rust side writes) survive, and so do app fields the form leaves out.
 * Saving app settings drops the single-folder keys the lists replaced.
 */
export function mergeStoredConfig(
  current: StoredConfig,
  cfg: Partial<DataSourceConfig>,
  app?: AppSettings,
  extra: Pick<StoredConfig, 'sourceRepos' | 'setup'> = {},
): StoredConfig {
  let nextApp = current.app;
  if (app) {
    const kept: Record<string, unknown> = { ...(current.app ?? {}) };
    for (const key of LEGACY_APP_KEYS) delete kept[key];
    nextApp = { ...kept, ...app };
  }
  return { ...current, ...cfg, ...extra, app: nextApp };
}

/** hbm-config.json as written to disk: 2-space JSON and a final newline. */
export const serializeStoredConfig = (stored: StoredConfig): string =>
  `${JSON.stringify(stored, null, 2)}\n`;
