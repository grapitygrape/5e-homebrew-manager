/** Stored-config helpers: deploy folder lists, legacy keys, setup keys. */
import { describe, it, expect } from 'vitest';
import {
  mergeStoredConfig,
  resolveStoredAppSettings,
  loadAppSettings,
  type StoredConfig,
} from '../config.ts';
import type { DataSourceConfig } from '../source.ts';

const base = loadAppSettings({});
const cfg: DataSourceConfig = {
  data: { path: 'C:/repos/5e/data' },
  schema: { path: 'C:/repos/5etools-utils/schema/brew' },
  guides: { path: './guides' },
  homebrew: { path: 'C:/repos/5e/homebrew' },
  partnered: { path: 'C:/repos/5e-homebrew' },
};

describe('resolveStoredAppSettings deploy folders', () => {
  it('turns the legacy single fields into lists', () => {
    const app = resolveStoredAppSettings(
      {
        foundryHomebrew: '\\\\SERVER\\Games\\Foundry\\Data\\assets\\homebrew',
        deployedHomebrew: 'W:/5e/homebrew',
      } as never,
      base,
    );
    expect(app.homebrewDeployFolders).toEqual([
      '\\\\SERVER\\Games\\Foundry\\Data\\assets\\homebrew',
      'W:/5e/homebrew',
    ]);
    expect(app.siteDeployFolders).toEqual(['W:/5e']);
  });

  it('prefers a legacy deployTarget for the site list', () => {
    const app = resolveStoredAppSettings(
      { deployTarget: 'X:/site', deployedHomebrew: 'W:/5e/homebrew' } as never,
      base,
    );
    expect(app.siteDeployFolders).toEqual(['X:/site']);
  });

  it('uses stored lists over the legacy fields', () => {
    const app = resolveStoredAppSettings(
      {
        siteDeployFolders: ['A:/site'],
        homebrewDeployFolders: [],
        deployedHomebrew: 'W:/5e/homebrew',
      } as never,
      base,
    );
    expect(app.siteDeployFolders).toEqual(['A:/site']);
    expect(app.homebrewDeployFolders).toEqual([]);
  });

  it('seeds the homebrew list from the legacy env vars', () => {
    const env = loadAppSettings({
      HBM_FOUNDRY_HOMEBREW: 'F:/hb',
      HBM_DEPLOYED_HOMEBREW: '',
    });
    expect(env.homebrewDeployFolders).toEqual(['F:/hb']);
  });
});

describe('mergeStoredConfig', () => {
  const current: StoredConfig = {
    app: {
      foundryHomebrew: 'F:/hb',
      deployedHomebrew: 'W:/5e/homebrew',
      deployTarget: 'W:/5e',
      toolsUrl: 'https://x',
    } as never,
    repos: { '5e': { locked: true } },
  };

  it('drops the legacy deploy keys when saving app settings', () => {
    const next = mergeStoredConfig(current, cfg, {
      ...base,
      siteDeployFolders: ['W:/5e'],
      homebrewDeployFolders: ['F:/hb'],
    });
    expect(next.app).not.toHaveProperty('foundryHomebrew');
    expect(next.app).not.toHaveProperty('deployedHomebrew');
    expect(next.app).not.toHaveProperty('deployTarget');
    expect(next.app?.siteDeployFolders).toEqual(['W:/5e']);
    expect(next.repos).toEqual({ '5e': { locked: true } });
  });

  it('writes sourceRepos and setup when given', () => {
    const next = mergeStoredConfig(current, cfg, undefined, {
      sourceRepos: { tools: { url: 'https://github.com/a/b', path: 'C:/t' } },
      setup: { completedAt: '2026-10-18T00:00:00.000Z' },
    });
    expect(next.sourceRepos?.tools?.path).toBe('C:/t');
    expect(next.setup?.completedAt).toBe('2026-10-18T00:00:00.000Z');
    // No app given: the stored app is left alone.
    expect(next.app).toEqual(current.app);
  });
});
