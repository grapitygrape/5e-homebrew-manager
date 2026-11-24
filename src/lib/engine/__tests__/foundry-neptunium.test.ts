/**
 * Neptunium's data source settings from the manager's config: the manager's
 * working-out, and the module's merge and write (run against stand-ins for
 * Foundry's globals).
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeNeptuniumConfig } from '../../../../foundry-homebrew-bridge/scripts/lib/neptunium-config.js';
import { storeNeptuniumSettings } from '../../../../foundry-homebrew-bridge/scripts/neptunium-settings.js';
import {
  foundryDataRelative,
  neptuniumSettings,
  readNeptuniumModule,
} from '../foundry/neptunium-settings.ts';

const SERVER = '\\\\SERVER\\Games\\Foundry\\Data\\assets\\homebrew';
const app = {
  toolsUrl: 'https://rules.example.com/5e',
  homebrewDeployFolders: ['W:/5e/homebrew', SERVER],
};
const on = { enabled: true, blocklistPlayers: true, blocklistGms: true };

describe('foundryDataRelative', () => {
  it("takes the path under Foundry's Data folder", () => {
    expect(foundryDataRelative(SERVER)).toBe('assets/homebrew');
    expect(foundryDataRelative('E:/Foundry v14/Data/assets/homebrew/')).toBe(
      'assets/homebrew',
    );
  });

  it("is null for a site's homebrew folder or Data itself", () => {
    expect(foundryDataRelative('W:/5e/homebrew')).toBeNull();
    expect(foundryDataRelative('E:/Foundry v14/Data')).toBeNull();
  });
});

describe('neptuniumSettings', () => {
  it('fills local homebrew, URLs and the blocklist switches', () => {
    expect(neptuniumSettings(app, on)).toEqual({
      dataSources: {
        isPlayerUseBlocklist: true,
        isGmUseBlocklist: true,
        isLoadLocalHomebrewIndex: true,
        localHomebrewDirectoryPath: 'assets/homebrew',
        isUseLocalHomebrewIndexJson: true,
        baseSiteUrl: 'https://rules.example.com/5e/',
        baseMediaUrlImg: 'https://rules.example.com/5e/img/',
        baseMediaUrlAudio: 'https://rules.example.com/5e/audio/',
        baseMediaUrlFonts: 'https://rules.example.com/5e/fonts/',
      },
    });
  });

  it("leaves out what the config doesn't say, and everything when off", () => {
    expect(
      neptuniumSettings(
        { toolsUrl: '', homebrewDeployFolders: ['W:/5e/homebrew'] },
        { ...on, blocklistGms: false },
      ),
    ).toEqual({ dataSources: { isPlayerUseBlocklist: true, isGmUseBlocklist: false } });
    expect(neptuniumSettings(app, { ...on, enabled: false })).toBeNull();
  });

  it("reads the module's saved state, defaulting like its module.json", () => {
    const manifest = JSON.parse(
      readFileSync('deploy-modules/foundry-neptunium/module.json', 'utf8'),
    );
    const defaults = Object.fromEntries(
      manifest.options.map((o: { id: string; default: boolean }) => [o.id, o.default]),
    );
    expect(readNeptuniumModule({})).toEqual({
      enabled: manifest.defaultEnabled,
      blocklistPlayers: defaults['blocklist-players'],
      blocklistGms: defaults['blocklist-gms'],
    });
    expect(
      readNeptuniumModule({
        deploy: {
          modules: {
            'foundry-neptunium': { enabled: false, options: { 'blocklist-gms': false } },
          },
        },
      }),
    ).toEqual({ enabled: false, blocklistPlayers: true, blocklistGms: false });
  });
});

describe('mergeNeptuniumConfig', () => {
  it('changes only differing keys and keeps the rest of the config', () => {
    const current = {
      dataSources: { baseSiteUrl: 'https://rules.example.com/5e/', isGmEnableSourceSelection: true },
      import: { x: 1 },
    };
    const { next, changed } = mergeNeptuniumConfig(current, {
      dataSources: { baseSiteUrl: 'https://rules.example.com/5e/', isUseLocalHomebrewIndexJson: true },
    });
    expect(changed.map((c) => c.key)).toEqual(['isUseLocalHomebrewIndexJson']);
    expect(next).toEqual({
      dataSources: {
        baseSiteUrl: 'https://rules.example.com/5e/',
        isGmEnableSourceSelection: true,
        isUseLocalHomebrewIndexJson: true,
      },
      import: { x: 1 },
    });
  });

  it("ignores keys it doesn't own and values of the wrong type", () => {
    const { changed } = mergeNeptuniumConfig(
      {},
      {
        dataSources: { isGmEnableSourceSelection: false, baseSiteUrl: 5 },
        import: { x: 2 },
      },
    );
    expect(changed).toEqual([]);
  });
});

describe('storeNeptuniumSettings', () => {
  let stored: Record<string, unknown>;
  const confirm = vi.fn(async () => false);

  beforeEach(() => {
    stored = { 'plutonium.config': { dataSources: { isLoadLocalHomebrewIndex: false } } };
    confirm.mockClear();
    vi.stubGlobal('game', {
      user: { isGM: true },
      modules: { get: () => ({ active: true }) },
      settings: {
        settings: new Map([['plutonium.config', {}]]),
        get: (mod: string, key: string) => stored[`${mod}.${key}`],
        set: async (mod: string, key: string, v: unknown) => {
          stored[`${mod}.${key}`] = v;
        },
      },
      i18n: { localize: (k: string) => k },
    });
    vi.stubGlobal('foundry', {
      utils: { escapeHTML: (s: string) => s },
      applications: { api: { DialogV2: { confirm } } },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes what differs and asks the GM to reload', async () => {
    const wanted = { dataSources: { isLoadLocalHomebrewIndex: true } };
    expect(await storeNeptuniumSettings(wanted)).toEqual({
      updated: ['isLoadLocalHomebrewIndex'],
    });
    expect(stored['plutonium.config']).toEqual(wanted);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('stays quiet when the world already matches', async () => {
    expect(
      await storeNeptuniumSettings({ dataSources: { isLoadLocalHomebrewIndex: false } }),
    ).toEqual({ updated: [] });
    expect(confirm).not.toHaveBeenCalled();
  });
});
