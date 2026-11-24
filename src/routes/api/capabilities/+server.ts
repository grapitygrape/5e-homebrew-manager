import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBackendReachable } from '$lib/server/backend';

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

export const GET: RequestHandler = async () => {
  const containerMode = process.env.HBM_CONTAINER === '1';
  const hasBackend = await isBackendReachable();
  const capabilities: RuntimeCapabilities = {
    runtime: containerMode ? 'container' : 'node',
    pipeline: hasBackend,
    repos: hasBackend,
    localSite: hasBackend,
    foundryBridge: true,
    nativeDialogs: false,
    siteBrowserWindow: false,
    portableImport: false,
    containerMode,
  };
  return json(capabilities);
};
