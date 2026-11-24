/** Tests for the Settings view and save through the desktop config provider. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  allowFoundryOrigin,
  saveSettings,
  settingsFromFields,
  settingsView,
} from '../settings-service.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { resetDataSource } from '../datasource.ts';
import { DEFAULT_APP_SETTINGS } from '$lib/data';
import { nodeConfigProvider } from '$lib/server/config-store';

let root = '';
let configPath = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-settings-'));
  configPath = path.join(root, 'hbm-config.json');
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

async function useConfig(stored: unknown): Promise<void> {
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
}

describe('settingsFromFields', () => {
  it('parses paths, URLs and the Foundry URL list, keeping the shop fields', () => {
    const { cfg, app } = settingsFromFields(
      {
        data: ' ./5e/data ',
        schema: 'https://example.com/schema/',
        foundryUrls: 'http://localhost:30000/game/, https://vtt.example/',
      },
      { ...DEFAULT_APP_SETTINGS, shopBookName: 'Kept' },
    );
    expect(cfg.data).toEqual({ path: './5e/data' });
    expect(cfg.schema).toEqual({ url: 'https://example.com/schema/' });
    expect(cfg.guides).toEqual({});
    expect(app.foundryUrls).toHaveLength(2);
    expect(app.shopBookName).toBe('Kept');
  });
});

describe('settingsView and saveSettings', () => {
  it('reports folder status against the config folder and saves to hbm-config.json', async () => {
    await mkdir(path.join(root, 'guides'));
    await useConfig({ repos: { '5e': { locked: true } } });

    const { status } = await saveSettings({
      guides: './guides',
      homebrew: './missing',
    });
    expect(status.guides).toMatchObject({ kind: 'path', exists: true });
    expect(status.homebrew).toMatchObject({ kind: 'path', exists: false });

    const stored = JSON.parse(await readFile(configPath, 'utf8'));
    expect(stored.guides).toEqual({ path: './guides' });
    expect(stored.repos).toEqual({ '5e': { locked: true } });

    const view = await settingsView();
    expect(view.storePath).toBe(configPath);
    expect(view.config.guides).toEqual({ path: './guides' });
  });
});

describe('settings repos and deploy lists', () => {
  it('reads list fields and repo fields', () => {
    const { app, sourceRepos } = settingsFromFields(
      {
        siteDeployFolders: ['W:/5e', ' ', ' X:/copy '],
        homebrewDeployFolders: 'F:/hb',
        'repo.tools.url': ' https://github.com/a/tools ',
        'repo.tools.path': 'C:/h/tools',
        'repo.images.url': '',
        'repo.images.path': '',
      },
      DEFAULT_APP_SETTINGS,
    );
    expect(app.siteDeployFolders).toEqual(['W:/5e', 'X:/copy']);
    expect(app.homebrewDeployFolders).toEqual(['F:/hb']);
    expect(sourceRepos).toEqual({
      tools: { url: 'https://github.com/a/tools', path: 'C:/h/tools' },
    });
  });

  it('leaves stored repos alone when the form has no repo fields', () => {
    expect(settingsFromFields({}, DEFAULT_APP_SETTINGS).sourceRepos).toBe(
      undefined,
    );
  });

  it('saves sourceRepos and shows them in the view', async () => {
    await useConfig({});
    await saveSettings({
      'repo.utils.url': 'https://github.com/a/utilities',
      'repo.utils.path': 'C:/h/utils',
    });
    const stored = JSON.parse(await readFile(configPath, 'utf8'));
    expect(stored.sourceRepos.utils.path).toBe('C:/h/utils');
    expect((await settingsView()).repos.utils).toEqual({
      url: 'https://github.com/a/utilities',
      path: 'C:/h/utils',
    });
  });
});

describe('allowFoundryOrigin', () => {
  it('adds the bare origin once, keeping the rest of the config', async () => {
    await useConfig({
      app: { foundryUrls: ['http://localhost:30000/game'], toolsUrl: 'x' },
    });
    expect(await allowFoundryOrigin('http://192.0.2.10:8443/game')).toEqual([
      'http://localhost:30000/game',
      'http://192.0.2.10:8443',
    ]);
    // Already allowed, by origin: no second entry.
    expect(await allowFoundryOrigin('http://localhost:30000')).toHaveLength(2);
    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.app.toolsUrl).toBe('x');
    expect(written.app.foundryUrls).toHaveLength(2);
  });

  it('rejects anything that is not an http(s) address', async () => {
    await useConfig({});
    await expect(allowFoundryOrigin('javascript:alert(1)')).rejects.toThrow();
    await expect(allowFoundryOrigin('not a url')).rejects.toThrow();
  });
});
