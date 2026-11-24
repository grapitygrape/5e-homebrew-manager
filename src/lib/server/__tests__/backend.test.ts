import { describe, it, expect } from 'vitest';
import {
  backendUrl,
  isBackendReachable,
  isProxiedBackendPath,
} from '../backend.ts';

describe('backendUrl', () => {
  it('defaults to http://127.0.0.1:5059 and strips trailing slashes', () => {
    expect(backendUrl({})).toBe('http://127.0.0.1:5059');
    expect(backendUrl({ HBM_BACKEND_URL: 'http://127.0.0.1:5099///' })).toBe(
      'http://127.0.0.1:5099',
    );
    expect(backendUrl({ HBM_BACKEND_URL: 'none' })).toBe(
      'http://127.0.0.1:5059',
    );
  });
});

describe('isBackendReachable', () => {
  it('respects explicit HBM_BACKEND_URL and HBM_CONTAINER flags', async () => {
    expect(await isBackendReachable({ HBM_BACKEND_URL: 'none' })).toBe(false);
    expect(
      await isBackendReachable({ HBM_BACKEND_URL: 'http://127.0.0.1:5059' }),
    ).toBe(true);
    expect(await isBackendReachable({ HBM_CONTAINER: '1' })).toBe(true);
  });
});

describe('isProxiedBackendPath', () => {
  it('matches hm-backend RPC, SSE, repos, modules, pipeline, setup, server, and foundry bridge routes', () => {
    expect(isProxiedBackendPath('/api/events')).toBe(true);
    expect(isProxiedBackendPath('/api/rpc/get_repos_overview')).toBe(true);
    expect(isProxiedBackendPath('/api/repos/overview')).toBe(true);
    expect(isProxiedBackendPath('/api/modules')).toBe(true);
    expect(isProxiedBackendPath('/api/modules/scripts')).toBe(true);
    expect(isProxiedBackendPath('/api/pipeline/run')).toBe(true);
    expect(isProxiedBackendPath('/api/setup/inspect')).toBe(true);
    expect(isProxiedBackendPath('/api/server/status')).toBe(true);
    expect(isProxiedBackendPath('/api/foundry/stream')).toBe(true);
    expect(isProxiedBackendPath('/api/foundry/result')).toBe(true);
    expect(isProxiedBackendPath('/api/foundry/state')).toBe(true);
    expect(isProxiedBackendPath('/api/foundry/status')).toBe(true);
  });

  it('leaves SvelteKit TypeScript routes (homebrew, blocklist, foundry/check, etc.) untouched', () => {
    expect(isProxiedBackendPath('/api/health')).toBe(false);
    expect(isProxiedBackendPath('/api/capabilities')).toBe(false);
    expect(isProxiedBackendPath('/api/homebrew')).toBe(false);
    expect(isProxiedBackendPath('/api/blocklist')).toBe(false);
    expect(isProxiedBackendPath('/api/foundry/check')).toBe(false);
    expect(isProxiedBackendPath('/api/foundry/open')).toBe(false);
  });
});
