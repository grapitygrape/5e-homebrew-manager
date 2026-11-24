import type {
  BridgeClientInfo,
  BridgeResult,
  FoundryCommandInput,
  FoundryQuery,
  RefusedOrigin,
} from '$lib/engine/foundry/types.ts';
import { isTauri, tauriCall, type UnlistenFn } from './tauri-core';
import { reachableFromPage } from './browser-url';
import { backendCall, getJson, listenEvent, postJson } from './transport';

export interface LocalServerStatus {
  running: boolean;
  port: number;
  url: string;
  rootDir: string;
  error: string | null;
}

export interface FoundryBridgeStatus {
  connected: boolean;
  clients: BridgeClientInfo[];
  allowedOrigins: string[];
  refused: RefusedOrigin[];
  stats: { clients: number; pending: number };
  managerUrl: string;
  error: string | null;
}

export interface SiteBlocklistRule {
  displayName: string;
  hash: string;
  category: string;
  source: string;
  isAuto: false;
}

export interface FolderCheck {
  state: 'missing' | 'empty' | 'match' | 'otherRepo' | 'noGit';
  remote: string | null;
  commitDate: string | null;
  shallow: boolean;
}

export interface SyncOutcome {
  action: 'cloned' | 'pulled' | 'skippedLocked';
  commitDate: string | null;
}

export interface SetupProgress {
  id: string;
  phase: string;
  percent: number | null;
  message: string;
}

// In a browser tab the backend's localhost URL may belong to another machine.
const withReachableUrl = (status: LocalServerStatus): LocalServerStatus =>
  isTauri() ? status : { ...status, url: reachableFromPage(status.url) };

export const getLocalServerStatus = (): Promise<LocalServerStatus> =>
  backendCall<LocalServerStatus>('get_local_server_status', undefined, () =>
    getJson<LocalServerStatus>('/api/server/status'),
  ).then(withReachableUrl);

export const restartLocalServer = (port?: number): Promise<LocalServerStatus> =>
  backendCall<LocalServerStatus>(
    'restart_local_server',
    { port: port ?? null },
    () =>
      postJson<LocalServerStatus>('/api/server/restart', {
        port: port ?? null,
      }),
  ).then(withReachableUrl);

export async function pickFolderDialog(
  initialDir?: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  return tauriCall<string | null>('pick_folder_dialog', {
    initialDir: initialDir ?? null,
  });
}

export async function openExternalTarget(target: string): Promise<void> {
  if (!isTauri()) {
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(target).catch(() => {});
    }
    return;
  }
  return tauriCall<void>('open_external_target', { target });
}

export const getFoundryBridgeStatus = (): Promise<FoundryBridgeStatus> =>
  backendCall<FoundryBridgeStatus>('foundry_status');

export const foundryAsk = (
  clientId: string,
  query: Omit<FoundryQuery, 'requestId'>,
): Promise<BridgeResult> =>
  backendCall<BridgeResult>('foundry_ask', { clientId, query });

export const foundryCommand = (
  clientId: string,
  command: FoundryCommandInput,
): Promise<BridgeResult> =>
  backendCall<BridgeResult>('foundry_command', { clientId, command });

export async function openSiteBrowser(): Promise<void> {
  if (!isTauri()) {
    const status = await getLocalServerStatus().catch(() => null);
    const url = status?.url || reachableFromPage('http://localhost:5050');
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  return tauriCall<void>('open_site_browser');
}

export async function takeSiteBlocklistRules(): Promise<SiteBlocklistRule[]> {
  return backendCall<SiteBlocklistRule[]>('take_site_blocklist_rules').catch(
    () => [],
  );
}

export const onSiteBlocklistAdded = (
  handler: () => void,
): Promise<UnlistenFn> =>
  listenEvent<number>('site-blocklist-added', () => handler());

export const onSiteShopsChanged = (
  handler: (file: string) => void,
): Promise<UnlistenFn> =>
  listenEvent<string>('site-shops-changed', handler);

export const gitVersion = (): Promise<string | null> =>
  backendCall<string | null>('git_version', undefined, () =>
    getJson<string | null>('/api/setup/git-version'),
  );

export const inspectSetupFolder = (
  path: string,
  url: string,
): Promise<FolderCheck> =>
  backendCall<FolderCheck>('inspect_setup_folder', { path, url }, () =>
    postJson<FolderCheck>('/api/setup/inspect', { path, url }),
  );

export const syncSetupRepo = (opts: {
  id: string;
  url: string;
  path: string;
  lockId: string | null;
}): Promise<SyncOutcome> =>
  backendCall<SyncOutcome>('sync_setup_repo', opts, () =>
    postJson<SyncOutcome>('/api/setup/sync', opts),
  );

export const onSetupProgress = (
  handler: (ev: SetupProgress) => void,
): Promise<UnlistenFn> => listenEvent<SetupProgress>('setup-progress', handler);

export const getInstalledSetup = (): Promise<string | null> =>
  backendCall<string | null>('get_installed_setup');

export const importInstalledSetup = (): Promise<string[]> =>
  backendCall<string[]>('import_installed_setup');

export const getBundledGuidesDir = (): Promise<string | null> =>
  backendCall<string | null>('get_bundled_guides_dir');

export const getBundledBridgeDir = (): Promise<string | null> =>
  backendCall<string | null>('get_bundled_bridge_dir');
