import { isTauri } from './tauri-core';
import { getJson } from './transport';

export interface RuntimeCapabilities {
  runtime: 'tauri' | 'node' | 'container';
  pipeline: boolean;
  repos: boolean;
  localSite: boolean;
  foundryBridge: boolean;
  nativeDialogs: boolean;
  siteBrowserWindow: boolean;
  portableImport: boolean;
  containerMode: boolean;
}

const TAURI_CAPABILITIES: RuntimeCapabilities = {
  runtime: 'tauri',
  pipeline: true,
  repos: true,
  localSite: true,
  foundryBridge: true,
  nativeDialogs: true,
  siteBrowserWindow: true,
  portableImport: true,
  containerMode: false,
};

let cached: Promise<RuntimeCapabilities> | null = null;

/** Runtime feature flags — cached per session so views can gate on capabilities instead of `isTauri()`. */
export function getCapabilities(): Promise<RuntimeCapabilities> {
  if (isTauri()) return Promise.resolve(TAURI_CAPABILITIES);
  cached ??= getJson<RuntimeCapabilities>('/api/capabilities').catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}
