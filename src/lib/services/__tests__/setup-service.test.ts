/** Setup's draft from an existing config, and what finishing writes. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileConfigProvider } from '../file-config.ts';
import { setConfigProvider } from '../config.ts';
import {
  completeSetup,
  setupCompleted,
  setupDraft,
  type SetupDraft,
} from '../setup-service.ts';
import { nodeConfigProvider } from '$lib/server/config-store';

let root: string;
let configPath: string;

async function useConfig(stored: unknown): Promise<void> {
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-setup-'));
  configPath = path.join(root, 'hbm-config.json');
});

afterEach(async () => {
  delete process.env.HBM_CONTAINER;
  setConfigProvider(nodeConfigProvider);
  await rm(root, { recursive: true, force: true });
});

const sample = {
  data: { path: 'C:/repos/5e/data' },
  schema: { path: 'C:/repos/5etools-utils/schema/brew' },
  guides: { path: './guides' },
  homebrew: { path: 'C:/repos/5e/homebrew' },
  partnered: { path: 'C:/repos/5e-homebrew' },
  app: {
    foundryHomebrew: '//SERVER/Games/Foundry/Data/assets/homebrew',
    deployedHomebrew: 'W:/5e/homebrew',
  },
  repos: { '5e': { locked: true } },
};

describe('setupDraft', () => {
  it('works back from a config written before setup existed', async () => {
    await useConfig(sample);
    expect(setupDraft()).toEqual({
      parent: 'C:/repos',
      repos: {
        tools: { url: '', path: 'C:/repos/5e' },
        siteImages: { url: '', path: 'C:/repos/5e/img' },
        homebrew: { url: '', path: 'C:/repos/5e-homebrew' },
        images: { url: '', path: 'C:/repos/5e/homebrew-img' },
        utils: { url: '', path: 'C:/repos/5etools-utils' },
      },
      siteDeployFolders: ['W:/5e'],
      // W:/5e/homebrew is the site folder's own, so it's left to finish.
      homebrewDeployFolders: ['//SERVER/Games/Foundry/Data/assets/homebrew'],
    });
    expect(setupCompleted()).toBe(false);
  });

  it('prefers stored sourceRepos', async () => {
    await useConfig({
      ...sample,
      sourceRepos: {
        tools: { url: 'https://github.com/a/tools', path: 'C:/t' },
      },
    });
    expect(setupDraft().repos.tools).toEqual({
      url: 'https://github.com/a/tools',
      path: 'C:/t',
    });
    expect(setupDraft().repos.utils.path).toBe('');
  });

  it('pre-fills /data/repos/* and /data/site on fresh container startup', async () => {
    process.env.HBM_CONTAINER = '1';
    await useConfig({});
    expect(setupDraft()).toEqual({
      parent: '/data/repos',
      repos: {
        tools: { url: '', path: '/data/repos/5e' },
        siteImages: { url: '', path: '/data/repos/5e-img' },
        homebrew: { url: '', path: '/data/repos/5e-homebrew' },
        images: { url: '', path: '/data/repos/homebrew-img' },
        utils: { url: '', path: '/data/repos/5e-utils' },
      },
      siteDeployFolders: ['/data/site'],
      homebrewDeployFolders: [],
    });
  });
});

describe('completeSetup', () => {
  it('writes repos, derived sources, deploy lists and the completed marker', async () => {
    await useConfig({ repos: { '5e': { locked: true } } });
    await completeSetup(
      {
        parent: 'C:/h',
        repos: {
          tools: { url: ' https://github.com/a/tools ', path: 'C:/h/tools' },
          homebrew: {
            url: 'https://github.com/a/homebrew',
            path: 'C:/h/homebrew',
          },
          siteImages: { url: '', path: '' },
          images: { url: '', path: '' },
          utils: { url: 'https://github.com/a/utilities', path: 'C:/h/utils' },
        },
        siteDeployFolders: ['W:/5e', ''],
        homebrewDeployFolders: [' F:/hb '],
      },
      new Date('2026-10-18T12:00:00Z'),
    );

    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.sourceRepos.tools).toEqual({
      url: 'https://github.com/a/tools',
      path: 'C:/h/tools',
    });
    expect(written.sourceRepos).not.toHaveProperty('images');
    expect(written.sourceRepos).not.toHaveProperty('siteImages');
    expect(written.data).toEqual({ path: 'C:/h/tools/data' });
    expect(written.schema).toEqual({ path: 'C:/h/utils/schema/brew' });
    expect(written.partnered).toEqual({ path: 'C:/h/homebrew' });
    expect(written).not.toHaveProperty('guides');
    expect(written.app.siteDeployFolders).toEqual(['W:/5e']);
    // The site folder's homebrew/ goes first, ahead of the typed folders.
    expect(written.app.homebrewDeployFolders).toEqual([
      'W:/5e/homebrew',
      'F:/hb',
    ]);
    expect(written.setup).toEqual({ completedAt: '2026-10-18T12:00:00.000Z' });
    expect(written.repos).toEqual({ '5e': { locked: true } });
    expect(setupCompleted()).toBe(true);
  });

  it('adds one homebrew folder per site folder without repeating a typed one', async () => {
    await useConfig({});
    const repos = Object.fromEntries(
      ['tools', 'siteImages', 'homebrew', 'images', 'utils'].map((id) => [
        id,
        { url: '', path: '' },
      ]),
    ) as SetupDraft['repos'];
    await completeSetup({
      parent: '',
      repos,
      siteDeployFolders: ['W:/5e/', '//host/share/site'],
      homebrewDeployFolders: ['w:/5E/homebrew', 'F:/hb'],
    });

    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.app.homebrewDeployFolders).toEqual([
      'W:/5e/homebrew',
      '//host/share/site/homebrew',
      'F:/hb',
    ]);
  });

  it('defaults homebrew to /data/config/homebrew in container mode when unset', async () => {
    process.env.HBM_CONTAINER = '1';
    await useConfig({});
    await completeSetup({
      parent: '/data/repos',
      repos: {
        tools: { url: 'https://github.com/a/tools', path: '/data/repos/5e' },
        siteImages: { url: '', path: '' },
        homebrew: {
          url: 'https://github.com/a/homebrew',
          path: '/data/repos/5e-homebrew',
        },
        images: { url: '', path: '' },
        utils: {
          url: 'https://github.com/a/utils',
          path: '/data/repos/5e-utils',
        },
      },
      siteDeployFolders: ['/data/site'],
      homebrewDeployFolders: [],
    });

    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.homebrew).toEqual({ path: '/data/config/homebrew' });
  });
});
