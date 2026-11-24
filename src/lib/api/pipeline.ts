import {
  backendCall,
  deleteJson,
  getJson,
  listenEvent,
  postJson,
  type UnlistenFn,
} from './transport';
import { isTauri } from './tauri-core';
import { reachableFromPage } from './browser-url';

export interface PipelineEvent {
  step: string;
  phase: string;
  level: 'info' | 'warn' | 'error' | 'step' | 'done';
  message: string;
}

export interface PipelineSummary {
  action: string;
  dryRun: boolean;
  ok: boolean;
  patchesApplied: number;
  patchesSkipped: string[];
  warnings: string[];
  logs: PipelineEvent[];
  previewUrl: string | null;
}

export interface ModuleCheck {
  id: string;
  status: 'ok' | 'skipped' | 'error' | 'off';
  details: string[];
}

export type ModuleOptionValue = boolean | string | string[];

export interface DeployModuleOption {
  id: string;
  label: string;
  kind: 'toggle' | 'list' | 'path' | 'text';
  value: ModuleOptionValue;
  default: ModuleOptionValue;
  group: string | null;
}

export interface DeployModule {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  options: DeployModuleOption[];
  card: string | null;
  link: { href: string; label: string } | null;
  replacedBy: string | null;
}

export interface DeployImageRepo {
  id: string;
  title: string;
  folder: string;
  path: string;
  downloaded: boolean;
}

export interface LastDeployRun {
  /** Unix seconds. */
  at: number;
  siteVersion: string | null;
  commits: Record<string, string>;
  modules: ModuleCheck[];
}

export interface LastPrepare {
  /** Unix seconds. */
  at: number;
  ok: boolean;
  siteVersion: string | null;
  commits: Record<string, string>;
  warnings: string[];
  blockedSources: string[];
  modules: ModuleCheck[];
}

export interface ScriptNameCheck {
  from: string | null;
  to: string;
  missing: { module: string; names: string[] }[];
}

export type DeployScriptKind = 'powershell' | 'shell' | 'node';

export interface DeployScript {
  id: string;
  title: string;
  kind: DeployScriptKind;
  enabled: boolean;
  content: string;
  path: string;
}

export type PipelineAction =
  | 'prepare'
  | 'full'
  | 'local'
  | 'publish'
  | `script:${string}`
  | `images:${string}`;

export const checkScriptNames = (): Promise<ScriptNameCheck> =>
  backendCall<ScriptNameCheck>('check_script_names', undefined, () =>
    getJson<ScriptNameCheck>('/api/modules/script-names'),
  );

export const checkDeployModules = (): Promise<ModuleCheck[]> =>
  backendCall<ModuleCheck[]>('check_deploy_modules', undefined, () =>
    getJson<ModuleCheck[]>('/api/modules/check'),
  );

export const listDeployModules = (): Promise<DeployModule[]> =>
  backendCall<DeployModule[]>('list_deploy_modules', undefined, () =>
    getJson<DeployModule[]>('/api/modules'),
  );

export const setDeployModule = (opts: {
  moduleId: string;
  enabled: boolean;
  options?: Record<string, ModuleOptionValue>;
}): Promise<void> => {
  const payload = {
    moduleId: opts.moduleId,
    enabled: opts.enabled,
    options: opts.options ?? null,
  };
  return backendCall('set_deploy_module', payload, () =>
    postJson('/api/modules/set', payload),
  );
};

export const listDeployImages = (): Promise<DeployImageRepo[]> =>
  backendCall<DeployImageRepo[]>('list_deploy_images', undefined, () =>
    getJson<DeployImageRepo[]>('/api/modules/images'),
  );

export const getLastDeployRun = (): Promise<LastDeployRun | null> =>
  backendCall<LastDeployRun | null>('get_last_deploy_run', undefined, () =>
    getJson<LastDeployRun | null>('/api/modules/last-run'),
  );

export const getLastPrepare = (): Promise<LastPrepare | null> =>
  backendCall<LastPrepare | null>('get_last_prepare', undefined, () =>
    getJson<LastPrepare | null>('/api/modules/last-prepare'),
  );

export const listDeployScripts = (): Promise<DeployScript[]> =>
  backendCall<DeployScript[]>('list_deploy_scripts', undefined, () =>
    getJson<DeployScript[]>('/api/modules/scripts'),
  );

export const saveDeployScript = (script: {
  id: string | null;
  title: string;
  kind: DeployScriptKind;
  content: string;
  enabled: boolean;
}): Promise<DeployScript> =>
  backendCall<DeployScript>('save_deploy_script', { script }, () =>
    postJson<DeployScript>('/api/modules/scripts', { script }),
  );

export const deleteDeployScript = (scriptId: string): Promise<void> =>
  backendCall('delete_deploy_script', { scriptId }, () =>
    deleteJson(`/api/modules/scripts/${encodeURIComponent(scriptId)}`),
  );

export const runPipeline = (
  action: PipelineAction,
  dryRun: boolean,
): Promise<PipelineSummary> =>
  backendCall<PipelineSummary>('run_pipeline', { action, dryRun }, () =>
    postJson<PipelineSummary>('/api/pipeline/run', { action, dryRun }),
  ).then((summary) =>
    // In a browser tab the backend's localhost URL may belong to another machine.
    summary?.previewUrl && !isTauri()
      ? { ...summary, previewUrl: reachableFromPage(summary.previewUrl) }
      : summary,
  );

export const onPipelineEvent = (
  handler: (ev: PipelineEvent) => void,
): Promise<UnlistenFn> => listenEvent<PipelineEvent>('pipeline-event', handler);
