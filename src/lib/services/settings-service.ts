/**
 * lib/services/settings-service.ts — the Settings view and its save.
 *
 * INTENT
 *   The view is the effective config, app settings, and a status per source
 *   (does that folder exist?). Save turns the form's text fields into a
 *   DataSourceConfig + AppSettings, persists them through the config provider
 *   (config-store on Node, hbm-config.json via lib/fs in the desktop shell),
 *   and drops the DataSource and its caches so the change applies at once.
 */
import { fs, path } from '$lib/fs';
import {
  SOURCE_REPOS,
  isAllUrls,
  parseSourceInput,
  parseUrlList,
  trimBaseUrl,
} from '$lib/data';
import type {
  AppSettings,
  DataSourceConfig,
  SourceRef,
  SourceRepo,
  SourceRepoId,
  SourceRepos,
} from '$lib/data';
import { configProvider } from './config';
import { resetDataSource } from './datasource';
import { setupCompleted, setupDraft } from './setup-service';

export interface SourceStatus {
  kind: 'path' | 'url' | 'unset';
  value: string;
  /** true/false for path sources (does it exist?), null for url/unset. */
  exists: boolean | null;
  /** Absolute resolved path, for display (path sources only). */
  resolved?: string;
}

export interface SettingsStatus {
  data: SourceStatus;
  schema: SourceStatus;
  guides: SourceStatus;
  homebrew: SourceStatus;
  partnered: SourceStatus;
}

export interface SettingsView {
  config: DataSourceConfig;
  app: AppSettings;
  status: SettingsStatus;
  storePath: string;
  /** The folder holding the config: fonts, deploy scripts and content files. */
  dataFolder: string;
  allUrls: boolean;
  /** Each repo's URL and folder, as setup would start from. */
  repos: Record<SourceRepoId, SourceRepo>;
  setupCompleted: boolean;
}

/**
 * The form's fields, by input name. Missing ones read as empty. The deploy
 * lists come as arrays; repos as `repo.<id>.url` / `repo.<id>.path`.
 */
export type SettingsFields = Partial<Record<string, string | string[]>>;

/** Describe a source for the Settings UI, checking path existence. */
export async function sourceStatus(
  ref: SourceRef,
  root: string = configProvider().root(),
): Promise<SourceStatus> {
  if (ref.url) return { kind: 'url', value: ref.url, exists: null };
  if (ref.path) {
    const resolved = path.isAbsolute(ref.path)
      ? ref.path
      : path.resolve(root, ref.path);
    return {
      kind: 'path',
      value: ref.path,
      exists: await fs().exists(resolved),
      resolved,
    };
  }
  return { kind: 'unset', value: '', exists: null };
}

async function buildStatus(cfg: DataSourceConfig): Promise<SettingsStatus> {
  const [data, schema, guides, homebrew, partnered] = await Promise.all([
    sourceStatus(cfg.data),
    sourceStatus(cfg.schema),
    sourceStatus(cfg.guides),
    sourceStatus(cfg.homebrew),
    sourceStatus(cfg.partnered ?? {}),
  ]);
  return { data, schema, guides, homebrew, partnered };
}

export async function settingsView(): Promise<SettingsView> {
  const provider = configProvider();
  const config = provider.effectiveConfig();
  return {
    config,
    app: provider.effectiveAppSettings(),
    status: await buildStatus(config),
    storePath: provider.storePath(),
    dataFolder: provider.root(),
    allUrls: isAllUrls(config),
    repos: setupDraft().repos,
    setupCompleted: setupCompleted(),
  };
}

const asList = (value: string | string[] | undefined): string[] =>
  (Array.isArray(value) ? value : [value ?? ''])
    .map((s) => s.trim())
    .filter(Boolean);

/** Repos from `repo.<id>.*` fields; undefined when the form has none. */
function reposFromFields(fields: SettingsFields): SourceRepos | undefined {
  if (!Object.keys(fields).some((k) => k.startsWith('repo.'))) return undefined;
  const out: SourceRepos = {};
  for (const { id } of SOURCE_REPOS) {
    const url = String(fields[`repo.${id}.url`] ?? '').trim();
    const path = String(fields[`repo.${id}.path`] ?? '').trim();
    if (url || path) out[id] = { url, path };
  }
  return out;
}

/** Parse the form. `current` supplies the fields the form no longer shows. */
export function settingsFromFields(
  fields: SettingsFields,
  current: AppSettings,
): { cfg: DataSourceConfig; app: AppSettings; sourceRepos?: SourceRepos } {
  const field = (name: string) => String(fields[name] ?? '');
  const cfg: DataSourceConfig = {
    data: parseSourceInput(field('data')),
    schema: parseSourceInput(field('schema')),
    guides: parseSourceInput(field('guides')),
    homebrew: parseSourceInput(field('homebrew')),
    partnered: parseSourceInput(field('partnered')),
  };
  const app: AppSettings = {
    toolsUrl: trimBaseUrl(field('toolsUrl')),
    foundryUrls: parseUrlList(field('foundryUrls')).map(trimBaseUrl),
    siteDeployFolders: asList(fields.siteDeployFolders),
    homebrewDeployFolders: asList(fields.homebrewDeployFolders),
    foundryDataPath: field('foundryDataPath').trim(),
    // The Shop view is retired, so its fields are no longer on the form; keep
    // whatever is stored rather than resetting to defaults on every save.
    shopBookSource: current.shopBookSource,
    shopBookName: current.shopBookName,
  };
  return { cfg, app, sourceRepos: reposFromFields(fields) };
}

/** Persist a Settings save and hot-reset the DataSource. */
export async function saveSettings(
  fields: SettingsFields,
): Promise<{ status: SettingsStatus }> {
  const provider = configProvider();
  const { cfg, app, sourceRepos } = settingsFromFields(
    fields,
    provider.effectiveAppSettings(),
  );
  await provider.save(cfg, app, sourceRepos ? { sourceRepos } : {});
  resetDataSource();
  return { status: await buildStatus(cfg) };
}

/**
 * Add a refused Foundry origin to Settings → Foundry URL: the Files view's
 * Allow button. Only a bare http(s) origin is accepted, so a junk or path-y
 * value can't widen the allowlist. Returns the saved list.
 */
export async function allowFoundryOrigin(value: string): Promise<string[]> {
  let origin: string;
  try {
    const url = new URL(value.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    origin = url.origin;
  } catch {
    throw new Error(`Not a Foundry address: ${value}`);
  }
  const provider = configProvider();
  const app = provider.effectiveAppSettings();
  const has = app.foundryUrls.some((u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  });
  if (has) return app.foundryUrls;
  const foundryUrls = [...app.foundryUrls, origin];
  await provider.save({}, { ...app, foundryUrls });
  return foundryUrls;
}
