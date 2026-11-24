/** Tests for the hbm-config.json provider the desktop shell boots services with. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  utimes,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFileConfigProvider } from '../file-config.ts';
import { setConfigProvider } from '../config.ts';
import {
  getDataSource,
  onDataSourceReset,
  resetDataSource,
} from '../datasource.ts';
import { getSchemasCached } from '../schema-service.ts';
import { resolveStoredConfig } from '$lib/data';
import { nodeConfigProvider } from '$lib/server/config-store';

let root: string;
let configPath: string;

/** Write the config with an explicit mtime, so refresh() sees a known change. */
async function writeConfig(stored: unknown, mtimeSec: number): Promise<void> {
  const text = typeof stored === 'string' ? stored : JSON.stringify(stored);
  await writeFile(configPath, text);
  await utimes(configPath, mtimeSec, mtimeSec);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-file-config-'));
  configPath = path.join(root, 'hbm-config.json');
  await mkdir(path.join(root, 'guides'));
  await mkdir(path.join(root, 'other-guides'));
  await writeFile(path.join(root, 'guides', 'Items.md'), '# Items');
  await writeFile(path.join(root, 'other-guides', 'Spells.md'), '# Spells');
});

afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

describe('createFileConfigProvider', () => {
  it('resolves relative source paths against the config file folder', async () => {
    await writeConfig({ guides: { path: './guides' } }, 1_000);
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    setConfigProvider(provider);
    resetDataSource();

    expect(provider.effectiveConfig().guides).toEqual({ path: './guides' });
    expect(await getDataSource().listGuides()).toEqual(['Items.md']);
  });

  it('reports a change only when the file mtime moves', async () => {
    await writeConfig({ app: { toolsUrl: 'https://one.example' } }, 1_000);
    const provider = createFileConfigProvider(configPath);

    expect(await provider.refresh()).toBe(true);
    expect(await provider.refresh()).toBe(false);
    expect(provider.effectiveAppSettings().toolsUrl).toBe(
      'https://one.example',
    );

    await writeConfig({ app: { toolsUrl: 'https://two.example' } }, 2_000);
    expect(await provider.refresh()).toBe(true);
    expect(provider.effectiveAppSettings().toolsUrl).toBe(
      'https://two.example',
    );
  });

  it('reads a missing or unparseable file as no overrides', async () => {
    const provider = createFileConfigProvider(configPath);
    expect(await provider.refresh()).toBe(true);
    expect(provider.effectiveConfig()).toEqual(resolveStoredConfig({}));

    await writeConfig({ guides: { path: './guides' } }, 1_000);
    await provider.refresh();
    await writeConfig('{nope', 2_000);
    expect(await provider.refresh()).toBe(true);
    expect(provider.effectiveConfig()).toEqual(resolveStoredConfig({}));
  });

  it('saves over the file as it is now, keeping keys the save does not own', async () => {
    await writeConfig({ app: { shopBookName: 'Shops' } }, 1_000);
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    // Rust writes repo locks after the snapshot was taken.
    await writeConfig(
      { app: { shopBookName: 'Shops' }, repos: { '5e': { locked: true } } },
      2_000,
    );

    const cfg = resolveStoredConfig({ guides: { path: './guides' } });
    await provider.save(cfg);

    const text = await readFile(configPath, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toEqual({
      ...cfg,
      app: { shopBookName: 'Shops' },
      repos: { '5e': { locked: true } },
    });
    expect(provider.effectiveConfig().guides).toEqual({ path: './guides' });
    expect(await provider.refresh()).toBe(false);
  });
});

describe('resetDataSource', () => {
  it('rebuilds the source from the new config after a refresh', async () => {
    await writeConfig({ guides: { path: './guides' } }, 1_000);
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    setConfigProvider(provider);
    resetDataSource();
    expect(await getDataSource().listGuides()).toEqual(['Items.md']);

    await writeConfig({ guides: { path: './other-guides' } }, 2_000);
    if (await provider.refresh()) resetDataSource();
    expect(await getDataSource().listGuides()).toEqual(['Spells.md']);
  });

  it('runs every registered reset, including the schema cache', async () => {
    await mkdir(path.join(root, 'schema-a'));
    await mkdir(path.join(root, 'schema-b'));
    await writeFile(
      path.join(root, 'schema-a', 'homebrew.json'),
      '{"title":"A"}',
    );
    await writeFile(
      path.join(root, 'schema-b', 'homebrew.json'),
      '{"title":"B"}',
    );
    await writeConfig({ schema: { path: './schema-a' } }, 1_000);
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    setConfigProvider(provider);
    resetDataSource();
    expect(Object.values(await getSchemasCached())).toEqual([{ title: 'A' }]);

    let resets = 0;
    onDataSourceReset(() => resets++);
    await writeConfig({ schema: { path: './schema-b' } }, 2_000);
    if (await provider.refresh()) resetDataSource();

    expect(resets).toBe(1);
    expect(Object.values(await getSchemasCached())).toEqual([{ title: 'B' }]);
  });
});

describe('createFileConfigProvider stored keys', () => {
  it('exposes the raw stored config', async () => {
    await writeConfig(
      { setup: { completedAt: '2026-10-18T00:00:00Z' } },
      1_000,
    );
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    expect(provider.stored().setup?.completedAt).toBe('2026-10-18T00:00:00Z');
  });

  it('saves sourceRepos and setup alongside the sources', async () => {
    await writeConfig({ repos: { '5e': { locked: true } } }, 1_000);
    const provider = createFileConfigProvider(configPath);
    await provider.refresh();
    await provider.save(resolveStoredConfig({}), undefined, {
      sourceRepos: { utils: { url: 'https://github.com/a/u', path: 'C:/u' } },
      setup: { completedAt: '2026-10-18T00:00:00Z' },
    });
    const written = JSON.parse(await readFile(configPath, 'utf8'));
    expect(written.sourceRepos.utils.path).toBe('C:/u');
    expect(written.setup.completedAt).toBe('2026-10-18T00:00:00Z');
    expect(written.repos).toEqual({ '5e': { locked: true } });
  });
});

describe('createFileConfigProvider defaults', () => {
  it('uses the given guides folder when none is stored', async () => {
    await writeConfig({}, 1_000);
    const provider = createFileConfigProvider(configPath, {
      guides: { path: 'C:/app/resources/guides' },
    });
    await provider.refresh();
    expect(provider.effectiveConfig().guides).toEqual({
      path: 'C:/app/resources/guides',
    });
  });

  it('lets a stored guides folder win', async () => {
    await writeConfig({ guides: { path: './guides' } }, 1_000);
    const provider = createFileConfigProvider(configPath, {
      guides: { path: 'C:/app/resources/guides' },
    });
    await provider.refresh();
    expect(provider.effectiveConfig().guides).toEqual({ path: './guides' });
  });
});

describe('createFileConfigProvider first save', () => {
  it('creates the config folder when it does not exist yet', async () => {
    const fresh = path.join(root, 'app-config', 'nested', 'hbm-config.json');
    const provider = createFileConfigProvider(fresh);
    await provider.refresh();
    await provider.save(resolveStoredConfig({}));
    expect(JSON.parse(await readFile(fresh, 'utf8'))).toHaveProperty('data');
  });
});

describe('createFileConfigProvider custom io', () => {
  it('delegates reads and patch saves to the provided io hooks', async () => {
    await writeConfig({ app: { toolsUrl: 'https://disk.example' } }, 1_000);
    let backendState: Record<string, unknown> = {
      app: { toolsUrl: 'https://rust.example' },
      repos: { '5e': { locked: true } },
    };
    const patches: unknown[] = [];
    const provider = createFileConfigProvider(configPath, {}, {
      read: async () => backendState,
      save: async (patch) => {
        patches.push(patch);
        backendState = { ...backendState, ...patch };
        await writeConfig(backendState, 2_000);
        return backendState;
      },
    });

    expect(await provider.refresh()).toBe(true);
    expect(provider.effectiveAppSettings().toolsUrl).toBe('https://rust.example');

    await provider.save({ guides: { path: './guides' } });
    expect(patches).toEqual([{ guides: { path: './guides' } }]);
    expect(provider.stored()).toMatchObject({
      guides: { path: './guides' },
      repos: { '5e': { locked: true } },
    });
    expect(await provider.refresh()).toBe(false);
  });
});
