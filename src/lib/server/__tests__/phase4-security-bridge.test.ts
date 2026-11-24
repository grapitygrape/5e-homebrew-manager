import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setFs } from '$lib/fs';
import { nodeFsAdapter } from '$lib/server/node-fs';
import { setConfigProvider } from '$lib/services/config';
import { nodeConfigProvider } from '$lib/server/config-store';
import { setBundledBridgeDir } from '$lib/services/bridge-deploy';
import {
  buildBridgeManifest,
  buildBridgeZipBuffer,
} from '$lib/server/bridge-package';
import { checkBasicAuth, isBasicAuthExempt } from '../../../hooks.server';

describe('Phase 4 security & bridge packaging', () => {
  beforeEach(() => {
    setFs(nodeFsAdapter);
    setConfigProvider(nodeConfigProvider);
    setBundledBridgeDir(path.join(process.cwd(), 'foundry-homebrew-bridge'));
  });

  it('exempts health, foundry bridge, and bridge manifest/zip endpoints from Basic Auth', () => {
    expect(isBasicAuthExempt('/api/health')).toBe(true);
    expect(isBasicAuthExempt('/api/foundry/stream')).toBe(true);
    expect(isBasicAuthExempt('/api/foundry/result')).toBe(true);
    expect(isBasicAuthExempt('/api/foundry/state')).toBe(true);
    expect(isBasicAuthExempt('/api/foundry/status')).toBe(true);
    expect(isBasicAuthExempt('/api/bridge/module.json')).toBe(true);
    expect(isBasicAuthExempt('/api/bridge/foundry-homebrew-bridge.zip')).toBe(true);
    expect(isBasicAuthExempt('/settings')).toBe(false);
    expect(isBasicAuthExempt('/api/settings')).toBe(false);
  });

  it('enforces HBM_AUTH_USER / HBM_AUTH_PASS Basic Auth when configured', () => {
    const env = {
      NODE_ENV: 'test',
      HBM_AUTH_USER: 'gm',
      HBM_AUTH_PASS: 'dragon',
    } as NodeJS.ProcessEnv;

    const unauthReq = new Request('http://synology.local:5052/settings');
    const challenge = checkBasicAuth(unauthReq, '/settings', env);
    expect(challenge).not.toBeNull();
    expect(challenge?.status).toBe(401);
    expect(challenge?.headers.get('WWW-Authenticate')).toContain('Basic realm=');

    // Exempt paths pass without Authorization header
    expect(checkBasicAuth(unauthReq, '/api/health', env)).toBeNull();
    expect(checkBasicAuth(unauthReq, '/api/bridge/module.json', env)).toBeNull();

    // Valid Basic Auth credentials pass
    const token = Buffer.from('gm:dragon', 'utf8').toString('base64');
    const authReq = new Request('http://synology.local:5052/settings', {
      headers: { Authorization: `Basic ${token}` },
    });
    expect(checkBasicAuth(authReq, '/settings', env)).toBeNull();
  });

  it('rewrites manifest and download URLs in buildBridgeManifest', async () => {
    const manifest = await buildBridgeManifest('https://hbm.synology.local:5052');
    expect(manifest.id).toBe('foundry-homebrew-bridge');
    expect(manifest.manifest).toBe(
      'https://hbm.synology.local:5052/api/bridge/module.json',
    );
    expect(manifest.download).toBe(
      'https://hbm.synology.local:5052/api/bridge/foundry-homebrew-bridge.zip',
    );
  });

  it('builds a valid zip archive containing foundry-homebrew-bridge/module.json', async () => {
    const buf = await buildBridgeZipBuffer('http://192.168.1.50:5052');
    // ZIP local file header magic PK\x03\x04
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    const ascii = buf.toString('utf8');
    expect(ascii).toContain('foundry-homebrew-bridge/module.json');
    expect(ascii).toContain('foundry-homebrew-bridge/scripts/bridge.js');
  });
});
