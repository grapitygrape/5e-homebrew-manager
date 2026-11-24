/** Tests for deploy path filtering, filename safety, raw read/save, and copy-overwrite. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  localDeployPath,
  deployTargets,
  safeHomebrewFilename,
  readHomebrewText,
  saveHomebrewText,
  deployHomebrewFile,
  deployFromHomebrew,
  deployAllFromHomebrew,
  foundryIndex,
  writeFoundryIndex,
} from '../homebrew-deploy.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';
import type { AppSettings } from '../../data/config.ts';

const app = (over: Partial<AppSettings> = {}): AppSettings => ({
  toolsUrl: '',
  foundryUrls: [],
  siteDeployFolders: [],
  homebrewDeployFolders: [],
  foundryDataPath: '',
  shopBookSource: 'HBMShops',
  shopBookName: 'Shops',
  ...over,
});

describe('localDeployPath', () => {
  it('returns a trimmed local path', () => {
    expect(localDeployPath('  C:\\Foundry\\Data\\homebrew  ')).toBe(
      'C:\\Foundry\\Data\\homebrew',
    );
  });
  it('returns null for empty, unset, or http(s) URLs', () => {
    expect(localDeployPath('')).toBeNull();
    expect(localDeployPath('   ')).toBeNull();
    expect(localDeployPath('https://example.com/homebrew')).toBeNull();
    expect(localDeployPath('http://localhost:30000/data')).toBeNull();
  });
});

describe('deployTargets', () => {
  it('includes every listed local folder, labelled by its path', () => {
    expect(
      deployTargets(
        app({
          homebrewDeployFolders: [
            'E:/Foundry/homebrew',
            'C:/repos/5e-homebrew',
            'W:/5e/homebrew',
          ],
        }),
      ),
    ).toEqual([
      { label: 'E:/Foundry/homebrew', path: 'E:/Foundry/homebrew' },
      { label: 'C:/repos/5e-homebrew', path: 'C:/repos/5e-homebrew' },
      { label: 'W:/5e/homebrew', path: 'W:/5e/homebrew' },
    ]);
  });
  it('omits blank and URL destinations', () => {
    expect(
      deployTargets(
        app({
          homebrewDeployFolders: ['https://foundry.local/hb', ' ', 'Q:/out'],
        }),
      ),
    ).toEqual([{ label: 'Q:/out', path: 'Q:/out' }]);
  });
});

describe('safeHomebrewFilename', () => {
  it('accepts a bare .json filename', () => {
    expect(safeHomebrewFilename('my-items.json')).toBe('my-items.json');
  });
  it('rejects path traversal, directories, and non-json', () => {
    expect(() => safeHomebrewFilename('../secret.json')).toThrow();
    expect(() => safeHomebrewFilename('a/b.json')).toThrow();
    expect(() => safeHomebrewFilename('a\\b.json')).toThrow();
    expect(() => safeHomebrewFilename('readme.md')).toThrow();
    expect(() => safeHomebrewFilename('')).toThrow();
  });
});

describe('homebrew save', () => {
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hbm-save-'));
    await mkdir(path.join(root, 'live'));
    const configPath = path.join(root, 'hbm-config.json');
    await writeFile(
      configPath,
      JSON.stringify({ homebrew: { path: './live' } }),
    );
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    setConfigProvider(provider);
  });
  afterEach(async () => {
    setConfigProvider(nodeConfigProvider);
    await rm(root, { recursive: true, force: true });
  });

  const brew = path.join('live', 'brew.json');

  it('reads the file text as-is, tabs included', async () => {
    const text = '{\n\t"_meta": {}\n}\n';
    await writeFile(path.join(root, brew), text, 'utf8');
    expect(await readHomebrewText('brew.json')).toBe(text);
  });

  it('overwrites the file with exactly the text given', async () => {
    await writeFile(path.join(root, brew), '{"old":1}', 'utf8');
    const text = '{\n\t"spell": []\n}\n';
    await saveHomebrewText('brew.json', text);
    expect(await readFile(path.join(root, brew), 'utf8')).toBe(text);
  });

  it('refuses text that is not a JSON object, leaving the file alone', async () => {
    await writeFile(path.join(root, brew), '{"old":1}', 'utf8');
    await expect(saveHomebrewText('brew.json', '{ "spell": [')).rejects.toThrow(
      /not valid JSON/,
    );
    await expect(saveHomebrewText('brew.json', '[1]')).rejects.toThrow(
      /object/,
    );
    expect(await readFile(path.join(root, brew), 'utf8')).toBe('{"old":1}');
  });

  it('only saves over a brew that already exists', async () => {
    await expect(saveHomebrewText('new.json', '{}')).rejects.toThrow(
      /not found/,
    );
  });

  it('rejects paths outside the working folder', async () => {
    await expect(saveHomebrewText('../brew.json', '{}')).rejects.toThrow(
      /Invalid filename/,
    );
    await expect(saveHomebrewText('index.json', '{}')).rejects.toThrow(
      /Invalid filename/,
    );
  });
});

describe('deployHomebrewFile', () => {
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hbm-deploy-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies the file into each destination, overwriting existing files', async () => {
    const srcDir = path.join(root, 'src');
    const foundry = path.join(root, 'foundry');
    const deployed = path.join(root, 'deployed');
    await mkdir(srcDir);
    await mkdir(foundry);
    await mkdir(deployed);
    await writeFile(path.join(srcDir, 'brew.json'), '{"v":1}', 'utf8');
    await writeFile(path.join(foundry, 'brew.json'), '{"v":0}', 'utf8');

    const result = await deployHomebrewFile({
      sourceDir: srcDir,
      file: 'brew.json',
      destinations: [
        { label: 'Foundry homebrew', path: foundry },
        { label: 'Deployed homebrew', path: deployed },
      ],
    });

    expect(result.copied).toEqual([foundry, deployed]);
    expect(result.errors).toEqual([]);
    expect(await readFile(path.join(foundry, 'brew.json'), 'utf8')).toBe(
      '{"v":1}',
    );
    expect(await readFile(path.join(deployed, 'brew.json'), 'utf8')).toBe(
      '{"v":1}',
    );
  });

  it('records an error when a destination folder is missing and still copies the rest', async () => {
    const srcDir = path.join(root, 'src');
    const good = path.join(root, 'good');
    await mkdir(srcDir);
    await mkdir(good);
    await writeFile(path.join(srcDir, 'brew.json'), '{}', 'utf8');

    const result = await deployHomebrewFile({
      sourceDir: srcDir,
      file: 'brew.json',
      destinations: [
        { label: 'Foundry homebrew', path: path.join(root, 'missing') },
        { label: 'Deployed homebrew', path: good },
      ],
    });

    expect(result.copied).toEqual([good]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].label).toBe('Foundry homebrew');
  });
});

describe('deployFromHomebrew', () => {
  let root = '';
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hbm-deploy-config-'));
  });
  afterEach(async () => {
    setConfigProvider(nodeConfigProvider);
    await rm(root, { recursive: true, force: true });
  });

  /** Point services at an hbm-config.json in `root`, as the desktop shell does. */
  async function useConfig(stored: unknown): Promise<void> {
    const configPath = path.join(root, 'hbm-config.json');
    await writeFile(configPath, JSON.stringify(stored));
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    setConfigProvider(provider);
  }

  it('copies from the working folder, resolving paths against the config folder', async () => {
    for (const dir of ['live', 'foundry', 'deployed'])
      await mkdir(path.join(root, dir));
    await writeFile(path.join(root, 'live', 'brew.json'), '{"v":2}', 'utf8');
    await useConfig({
      homebrew: { path: './live' },
      app: { foundryHomebrew: './foundry', deployedHomebrew: './deployed' },
    });

    const result = await deployFromHomebrew('brew.json');

    expect(result.copied).toHaveLength(2);
    expect(result.errors).toEqual([]);
    for (const dir of ['foundry', 'deployed'])
      expect(await readFile(path.join(root, dir, 'brew.json'), 'utf8')).toBe(
        '{"v":2}',
      );
  });

  it('prices the deployed copies from content/item-prices.json and leaves the source alone', async () => {
    for (const dir of ['live', 'deployed', 'content'])
      await mkdir(path.join(root, dir));
    const brew =
      '{"item":[{"name":"Bag of Holding","source":"MINE","value":50000}]}';
    await writeFile(path.join(root, 'live', 'brew.json'), brew, 'utf8');
    await writeFile(
      path.join(root, 'live', 'other.json'),
      '{"item":[]}',
      'utf8',
    );
    await writeFile(
      path.join(root, 'content', 'item-prices.json'),
      JSON.stringify({
        prices: [{ name: 'bag of holding', cost: 400, max: 600 }],
      }),
    );
    await useConfig({
      homebrew: { path: './live' },
      app: { homebrewDeployFolders: ['./deployed'] },
    });

    await deployFromHomebrew('brew.json');
    await deployFromHomebrew('other.json');

    const out = JSON.parse(
      await readFile(path.join(root, 'deployed', 'brew.json'), 'utf8'),
    );
    expect(out.item[0]).toEqual({
      name: 'Bag of Holding',
      source: 'MINE',
      value: 40000,
      hbmPrice: { max: 60000, original: 50000 },
    });
    expect(await readFile(path.join(root, 'live', 'brew.json'), 'utf8')).toBe(
      brew,
    );
    // Nothing to price: copied byte for byte.
    expect(
      await readFile(path.join(root, 'deployed', 'other.json'), 'utf8'),
    ).toBe('{"item":[]}');
  });

  it('copies to every folder in the list', async () => {
    for (const dir of ['live', 'a', 'b', 'c'])
      await mkdir(path.join(root, dir));
    await writeFile(path.join(root, 'live', 'brew.json'), '{"v":3}', 'utf8');
    await useConfig({
      homebrew: { path: './live' },
      app: { homebrewDeployFolders: ['./a', './b', './c'] },
    });

    const result = await deployFromHomebrew('brew.json');

    expect(result.copied).toHaveLength(3);
    expect(await readFile(path.join(root, 'c', 'brew.json'), 'utf8')).toBe(
      '{"v":3}',
    );
  });

  it('deploys every brew but not the index files, naming each failure', async () => {
    for (const dir of ['live', 'a', 'b']) await mkdir(path.join(root, dir));
    for (const f of ['A; One.json', 'B; Two.json', 'index.json'])
      await writeFile(path.join(root, 'live', f), `"${f}"`, 'utf8');
    await useConfig({
      homebrew: { path: './live' },
      app: { homebrewDeployFolders: ['./a', './b', './gone'] },
    });

    const result = await deployAllFromHomebrew();

    expect(result.files).toBe(2);
    expect(result.copied.map((p) => path.basename(p))).toEqual(['a', 'b']);
    expect(result.errors.map((e) => e.file)).toEqual([
      'A; One.json',
      'B; Two.json',
    ]);
    expect(await readFile(path.join(root, 'b', 'B; Two.json'), 'utf8')).toBe(
      '"B; Two.json"',
    );
    await expect(
      readFile(path.join(root, 'a', 'index.json'), 'utf8'),
    ).rejects.toThrow();
  });

  it('refuses when Settings names no destination', async () => {
    await useConfig({
      homebrew: { path: './live' },
      app: { foundryHomebrew: '', deployedHomebrew: '' },
    });
    await expect(deployFromHomebrew('brew.json')).rejects.toThrow(
      'No deploy destinations configured',
    );
  });
});

describe("Foundry's index.json", () => {
  it('lists every brew but leaves the blocklist and itself out', () => {
    expect(
      foundryIndex({ readme: ['x'], toImport: ['Old.json'] }, [
        'index.json',
        'content-blocklist.json',
        'B; Two.json',
        'A; One.json',
        'notes.txt',
      ]),
    ).toEqual({ readme: ['x'], toImport: ['A; One.json', 'B; Two.json'] });
  });

  it('is null when the index already matches', () => {
    expect(
      foundryIndex({ toImport: ['A.json'] }, ['A.json', 'index.json']),
    ).toBeNull();
  });

  it("writes into a folder under Foundry's Data folder only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hbm-foundry-index-'));
    try {
      const foundry = path.join(root, 'Data', 'assets', 'homebrew');
      const site = path.join(root, 'site', 'homebrew');
      for (const dir of [foundry, site]) {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'Brew.json'), '{}', 'utf8');
        await writeFile(path.join(dir, 'content-blocklist.json'), '{}', 'utf8');
      }
      await writeFoundryIndex(foundry);
      await writeFoundryIndex(site);
      expect(
        JSON.parse(await readFile(path.join(foundry, 'index.json'), 'utf8')),
      ).toEqual({ toImport: ['Brew.json'] });
      await expect(
        readFile(path.join(site, 'index.json'), 'utf8'),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
