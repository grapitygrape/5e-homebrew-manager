/** Tests for finding, comparing and copying the Foundry bridge module. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bridgeDeployStatus,
  deployBridge,
  findModulesDir,
  setBundledBridgeDir,
  syncBridge,
} from '../bridge-deploy.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';

let root = '';
let configPath = '';
/** A checkout holding the module in a subfolder, like this repo does. */
let repo = '';
let moduleDir = '';
/** A Foundry user data folder: <foundry>/Data/modules. */
let foundry = '';
let modules = '';

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-bridge-deploy-'));
  configPath = path.join(root, 'hbm-config.json');
  repo = path.join(root, 'manager');
  moduleDir = path.join(repo, 'foundry-homebrew-bridge');
  foundry = path.join(root, 'FoundryVTT');
  modules = path.join(foundry, 'Data', 'modules');
  await mkdir(path.join(moduleDir, 'scripts', 'lib'), { recursive: true });
  await mkdir(path.join(moduleDir, '.git'), { recursive: true });
  await mkdir(modules, { recursive: true });
  await writeFile(
    path.join(moduleDir, 'module.json'),
    JSON.stringify({ id: 'foundry-homebrew-bridge', version: '1.1.0' }),
  );
  await writeFile(path.join(moduleDir, 'scripts', 'bridge.js'), 'one');
  await writeFile(path.join(moduleDir, 'scripts', 'lib', 'match.js'), 'two');
  await writeFile(path.join(moduleDir, '.git', 'HEAD'), 'not module');
});

afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  setBundledBridgeDir('');
  await rm(root, { recursive: true, force: true });
});

async function useConfig(bridgeRepo: string, foundryData: string) {
  await writeFile(
    configPath,
    JSON.stringify({
      app: { foundryDataPath: foundryData },
    }),
  );
  setBundledBridgeDir(bridgeRepo);
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
}

const installed = (...parts: string[]) =>
  path.join(modules, 'foundry-homebrew-bridge', ...parts);

describe('findModulesDir', () => {
  it('accepts the user data folder, the Data folder, or modules itself', async () => {
    const want = modules.replace(/\\/g, '/');
    for (const p of [foundry, path.join(foundry, 'Data'), modules]) {
      expect((await findModulesDir(p.replace(/\\/g, '/')))?.toLowerCase()).toBe(
        want.toLowerCase(),
      );
    }
  });

  it('is null when there is no modules folder', async () => {
    expect(await findModulesDir(root)).toBeNull();
  });
});

describe('bridgeDeployStatus', () => {
  it('names whichever path is missing', async () => {
    await useConfig('', foundry);
    const noModule = await bridgeDeployStatus();
    expect(noModule.state).toBe('unset');
    expect(noModule.message).toContain('bundled bridge module');

    await useConfig(repo, '');
    const noData = await bridgeDeployStatus();
    expect(noData.state).toBe('unset');
    expect(noData.message).toContain('Foundry Data folder');
  });

  it('refuses a repo without the module', async () => {
    await useConfig(root, foundry);
    expect((await bridgeDeployStatus()).state).toBe('no-source');
  });

  it('refuses a Foundry path without a modules folder', async () => {
    await useConfig(repo, repo);
    expect((await bridgeDeployStatus()).state).toBe('no-foundry');
  });

  it('finds the module in a subfolder and reports it missing', async () => {
    await useConfig(repo, foundry);
    const s = await bridgeDeployStatus();
    expect(s.state).toBe('missing');
    expect(s.sourceVersion).toBe('1.1.0');
  });
});

describe('deployBridge', () => {
  it('copies every module file, skipping dot folders, then reads as current', async () => {
    await useConfig(repo, foundry);
    const result = await deployBridge();
    expect(result.copied).toBe(3);
    expect(
      await readFile(installed('scripts', 'lib', 'match.js'), 'utf8'),
    ).toBe('two');
    await expect(readFile(installed('.git', 'HEAD'))).rejects.toThrow();
    const s = await bridgeDeployStatus();
    expect(s.state).toBe('current');
    expect(s.installedVersion).toBe('1.1.0');
  });

  it('reports a changed repo file as outdated, and sync brings it current', async () => {
    await useConfig(repo, foundry);
    await deployBridge();
    await writeFile(path.join(moduleDir, 'scripts', 'bridge.js'), 'changed');
    const s = await bridgeDeployStatus();
    expect(s.state).toBe('outdated');
    expect(s.changed).toEqual(['scripts/bridge.js']);

    expect((await syncBridge())?.copied).toBe(3);
    expect(await readFile(installed('scripts', 'bridge.js'), 'utf8')).toBe(
      'changed',
    );
    // Nothing left to do.
    expect(await syncBridge()).toBeNull();
  });

  it('never copies into a linked install', async () => {
    // A junction needs no admin rights on Windows; elsewhere it's a symlink.
    await symlink(moduleDir, installed(), 'junction');
    await useConfig(repo, foundry);
    expect((await bridgeDeployStatus()).state).toBe('linked');
    await expect(deployBridge()).rejects.toThrow(/nothing to copy/);
    expect(await syncBridge()).toBeNull();
    expect(
      await readFile(path.join(moduleDir, 'scripts', 'bridge.js'), 'utf8'),
    ).toBe('one');
  });

  it('never writes through a link to some other copy of the module', async () => {
    // The dev setup: Foundry links to the working checkout, while the bundled
    // copy is an older snapshot. Copying would roll the checkout back.
    const live = path.join(root, 'live', 'foundry-homebrew-bridge');
    await mkdir(path.join(live, 'scripts'), { recursive: true });
    await writeFile(
      path.join(live, 'module.json'),
      JSON.stringify({ id: 'foundry-homebrew-bridge', version: '1.2.0' }),
    );
    await writeFile(path.join(live, 'scripts', 'bridge.js'), 'newer edit');
    await symlink(live, installed(), 'junction');
    await useConfig(repo, foundry);

    const s = await bridgeDeployStatus();
    expect(s.state).toBe('linked');
    expect(s.message).toContain('link');
    await expect(deployBridge()).rejects.toThrow(/link/);
    expect(await syncBridge()).toBeNull();
    expect(
      await readFile(path.join(live, 'scripts', 'bridge.js'), 'utf8'),
    ).toBe('newer edit');
  });
});
