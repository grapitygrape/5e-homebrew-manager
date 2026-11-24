/** Tests for repo catalog listing, index.json upkeep, add, and retire-to-unused. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  listCatalog,
  addFromRepo,
  retireToUnused,
  addToLiveFolders,
  listLibrary,
  readLibraryFile,
  repoDir,
  retireFromLiveFolders,
  findUpstreamUpdates,
  upstreamUpdates,
} from '../homebrew-library.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';

const BREW = 'Kobold Press; Tome of Beasts 2.json';
const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );
const toImport = async (dir: string) =>
  JSON.parse(await readFile(path.join(dir, 'index.json'), 'utf8')).toImport;

let root: string;
let repo: string;
let live: string;
let deployed: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-library-'));
  repo = path.join(root, 'repo');
  live = path.join(root, 'live');
  deployed = path.join(root, 'deployed');
  await mkdir(path.join(repo, 'creature'), { recursive: true });
  await mkdir(path.join(repo, '_generated'), { recursive: true });
  await writeFile(path.join(repo, 'creature', BREW), '{"monster":[]}');
  await writeFile(path.join(repo, 'creature', 'Zed; Unindexed.json'), '{}');
  await writeFile(
    path.join(repo, '_generated', 'index-meta.json'),
    JSON.stringify({ [BREW]: { n: ['Tome of Beasts 2'], a: ['ToB2'] } }),
  );
  for (const dir of [live, deployed]) {
    await mkdir(dir);
    await writeFile(
      path.join(dir, 'index.json'),
      `${JSON.stringify({ readme: ['x'], toImport: ['MCDM; A.json', 'hightouch; B.json'], notUsed: [] }, null, '\t')}\n`,
    );
  }
});

afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  await rm(root, { recursive: true, force: true });
});

const destinations = () => [
  { label: 'Homebrew', path: live },
  { label: 'Deployed homebrew', path: deployed },
];

describe('catalog', () => {
  it('walks type folders, skips _generated, and attaches index-meta names', async () => {
    const catalog = await listCatalog(repo);
    expect(catalog.map((c) => c.file)).toEqual([BREW, 'Zed; Unindexed.json']);
    expect(catalog[0]).toMatchObject({
      folder: 'creature',
      names: ['Tome of Beasts 2'],
      abbreviations: ['ToB2'],
    });
  });
});

describe('addFromRepo', () => {
  it('copies into every folder and inserts into toImport in ordinal order', async () => {
    const result = await addFromRepo({
      repoDir: repo,
      folder: 'creature',
      file: BREW,
      destinations: destinations(),
    });
    expect(result).toEqual({ done: [live, deployed], errors: [] });
    for (const dir of [live, deployed]) {
      expect(await exists(path.join(dir, BREW))).toBe(true);
      expect(await toImport(dir)).toEqual([
        BREW,
        'MCDM; A.json',
        'hightouch; B.json',
      ]);
    }
    // Tab indentation and trailing newline survive the rewrite.
    const raw = await readFile(path.join(live, 'index.json'), 'utf8');
    expect(raw).toContain('\n\t"toImport": [\n\t\t"');
    expect(raw.endsWith('}\n')).toBe(true);
  });
  it('does not duplicate an entry already listed', async () => {
    const args = {
      repoDir: repo,
      folder: 'creature',
      file: BREW,
      destinations: destinations(),
    };
    await addFromRepo(args);
    await addFromRepo(args);
    expect(
      (await toImport(live)).filter((f: string) => f === BREW),
    ).toHaveLength(1);
  });
  it('rejects traversal in the folder or file', async () => {
    await expect(
      addFromRepo({
        repoDir: repo,
        folder: '..',
        file: BREW,
        destinations: destinations(),
      }),
    ).rejects.toThrow('Invalid repo folder');
    await expect(
      addFromRepo({
        repoDir: repo,
        folder: 'creature',
        file: '../x.json',
        destinations: destinations(),
      }),
    ).rejects.toThrow('Invalid filename');
  });
  it('reports a missing destination without blocking the others', async () => {
    const result = await addFromRepo({
      repoDir: repo,
      folder: 'creature',
      file: BREW,
      destinations: [
        { label: 'Gone', path: path.join(root, 'nope') },
        ...destinations(),
      ],
    });
    expect(result.done).toEqual([live, deployed]);
    expect(result.errors.map((e) => e.label)).toEqual(['Gone']);
  });
});

describe('retireToUnused', () => {
  it('moves the file into unused/ and drops it from toImport', async () => {
    await writeFile(path.join(live, 'MCDM; A.json'), '{}');
    await writeFile(path.join(deployed, 'MCDM; A.json'), '{}');
    const result = await retireToUnused({
      file: 'MCDM; A.json',
      destinations: destinations(),
    });
    expect(result).toEqual({ done: [live, deployed], errors: [] });
    for (const dir of [live, deployed]) {
      expect(await exists(path.join(dir, 'MCDM; A.json'))).toBe(false);
      expect(await exists(path.join(dir, 'unused', 'MCDM; A.json'))).toBe(true);
      expect(await toImport(dir)).toEqual(['hightouch; B.json']);
    }
  });
  it('still cleans the index in a folder that lacks the file', async () => {
    await writeFile(path.join(live, 'MCDM; A.json'), '{}');
    const result = await retireToUnused({
      file: 'MCDM; A.json',
      destinations: destinations(),
    });
    expect(result.errors).toEqual([]);
    expect(await toImport(deployed)).toEqual(['hightouch; B.json']);
  });
});

/** Point services at an hbm-config.json in `root`, as the desktop shell does. */
async function useConfig(stored: unknown): Promise<void> {
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
}

describe('findUpstreamUpdates', () => {
  const catalog = [
    { file: 'A; Old.json', folder: 'collection', names: [], abbreviations: [] },
    { file: 'B; Same.json', folder: 'creature', names: [], abbreviations: [] },
    { file: 'C; Newer.json', folder: 'spell', names: [], abbreviations: [] },
  ];
  const stamps = {
    'collection/A; Old.json': { m: 1794153308 },
    'creature/B; Same.json': { m: 1700000000 },
    'spell/C; Newer.json': { m: 1700000000 },
  };

  it('flags only copies the repo changed after', () => {
    const found = findUpstreamUpdates(
      [
        { file: 'A; Old.json', dateLastModified: 1791468262 },
        { file: 'B; Same.json', dateLastModified: 1700000000 },
        { file: 'C; Newer.json', dateLastModified: 1800000000 },
        { file: 'D; Mine.json', dateLastModified: 1 },
      ],
      catalog,
      stamps,
    );
    expect(found).toEqual({
      'A; Old.json': {
        folder: 'collection',
        updated: 1794153308,
        local: 1791468262,
      },
    });
  });

  it('skips a copy with no date of its own', () => {
    expect(
      findUpstreamUpdates(
        [{ file: 'A; Old.json', dateLastModified: 0 }],
        catalog,
        stamps,
      ),
    ).toEqual({});
  });
});

describe('configured folders', () => {
  // Relative paths, so these only pass when they resolve against the config
  // folder rather than the process cwd.
  const relative = {
    homebrew: { path: './live' },
    partnered: { path: './repo' },
    app: { deployedHomebrew: './deployed' },
  };

  it('adds to and retires from both live folders', async () => {
    await useConfig(relative);
    expect((await addToLiveFolders('creature', BREW)).done).toHaveLength(2);
    expect(await toImport(live)).toContain(BREW);
    expect(await toImport(deployed)).toContain(BREW);

    expect((await retireFromLiveFolders(BREW)).done).toHaveLength(2);
    expect(await exists(path.join(live, 'unused', BREW))).toBe(true);
    expect(await toImport(deployed)).not.toContain(BREW);
  });

  it('treats every homebrew deploy folder as a live folder', async () => {
    const foundry = path.join(root, 'foundry');
    await mkdir(foundry, { recursive: true });
    await writeFile(
      path.join(foundry, 'index.json'),
      JSON.stringify({ toImport: [] }),
    );
    await useConfig({
      homebrew: { path: './live' },
      partnered: { path: './repo' },
      app: { homebrewDeployFolders: ['./deployed', './foundry'] },
    });
    expect((await addToLiveFolders('creature', BREW)).done).toHaveLength(3);
    expect(await toImport(foundry)).toContain(BREW);
  });

  it('lists every repo brew with authors, repo dates, size and installed', async () => {
    await useConfig(relative);
    await writeFile(path.join(live, BREW), '{}');
    await writeFile(
      path.join(repo, '_generated', 'index-timestamps.json'),
      JSON.stringify({ [`creature/${BREW}`]: { a: 1, m: 1700000000 } }),
    );
    const { entries } = await listLibrary();
    expect(entries).toMatchObject([
      {
        file: BREW,
        authors: 'Kobold Press',
        mtime: 1700000000 * 1000,
        size: '{"monster":[]}'.length,
        installed: true,
      },
      {
        file: 'Zed; Unindexed.json',
        authors: 'Zed',
        mtime: 0,
        installed: false,
      },
    ]);
  });

  it('checks local files against the repo, and stays quiet without one', async () => {
    await writeFile(
      path.join(repo, '_generated', 'index-timestamps.json'),
      JSON.stringify({ [`creature/${BREW}`]: { a: 1, m: 1700000500 } }),
    );
    const files = [{ file: BREW, dateLastModified: 1700000000 }];
    await useConfig(relative);
    expect(await upstreamUpdates(files)).toEqual({
      [BREW]: { folder: 'creature', updated: 1700000500, local: 1700000000 },
    });
    await useConfig({ homebrew: { path: './live' } });
    expect(await upstreamUpdates(files)).toEqual({});
  });

  it('reads one repo brew and refuses paths outside the repo', async () => {
    await useConfig(relative);
    expect(await readLibraryFile('creature', BREW)).toEqual({ monster: [] });
    await expect(readLibraryFile('..', BREW)).rejects.toThrow(
      'Invalid repo folder',
    );
    await expect(readLibraryFile('creature', 'Nope.json')).rejects.toThrow(
      'Not in the homebrew repo',
    );
  });

  it('refuses when Settings names no repo or no live folder', async () => {
    await useConfig({
      homebrew: {},
      partnered: {},
      app: { deployedHomebrew: '' },
    });
    expect(() => repoDir()).toThrow('No homebrew repo path configured');
    await expect(addToLiveFolders('creature', BREW)).rejects.toThrow(
      'No local homebrew folders configured',
    );
  });
});
