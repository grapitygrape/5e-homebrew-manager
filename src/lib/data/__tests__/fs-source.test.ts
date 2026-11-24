import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FsDataSource } from '../fs-source.ts';
import { composeItemCatalog } from '../source.ts';

let root: string;
let source: FsDataSource;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-fssource-'));
  const at = (...p: string[]) => path.join(root, ...p);
  await mkdir(at('data', 'spells'), { recursive: true });
  await mkdir(at('data', 'generated'), { recursive: true });
  await mkdir(at('schema', 'entry'), { recursive: true });
  await mkdir(at('guides'), { recursive: true });
  await mkdir(at('homebrew'), { recursive: true });
  await writeFile(at('data', 'items.json'), '{"item":[]}');
  await writeFile(at('data', 'spells', 'spells-phb.json'), '{"spell":[]}');
  await writeFile(
    at('data', 'tables.json'),
    '{"table":[{"name":"Trinkets","source":"PHB"}]}',
  );
  await writeFile(
    at('data', 'generated', 'gendata-tables.json'),
    '{"table":[{"name":"Indefinite Madness","source":"DMG"}]}',
  );
  await writeFile(at('schema', 'homebrew.json'), '{"title":"root"}');
  await writeFile(at('schema', 'entry', 'entry.json'), '{"title":"entry"}');
  await writeFile(at('schema', 'broken.json'), '{nope');
  await writeFile(at('guides', 'b.md'), '# B');
  await writeFile(at('guides', 'a.md'), '# A');
  await writeFile(at('guides', 'notes.txt'), '');
  await writeFile(
    at('homebrew', 'Kobold; Brew.json'),
    '{"_meta":{"sources":[{"full":"Kobold Brew"}]},"item":[{"name":"X"}]}',
  );
  await writeFile(at('homebrew', 'Bad.json'), '{oops');
  await writeFile(at('homebrew', 'index.json'), '{"toImport":[]}');
  await writeFile(at('homebrew', 'content-blocklist.json'), '{"old":true}');
  // Relative refs resolve against the root, as they do from hbm-config.json.
  source = new FsDataSource(
    {
      data: { path: 'data' },
      schema: { path: 'schema' },
      guides: { path: 'guides' },
      homebrew: { path: 'homebrew' },
    },
    root,
  );
});

afterAll(() => rm(root, { recursive: true, force: true }));

describe('FsDataSource', () => {
  it('loads official tables from both the main and the generated file', async () => {
    const tables = await source.getOfficial('table');
    expect(tables.map((t) => t.name)).toEqual([
      'Trinkets',
      'Indefinite Madness',
    ]);
  });

  it('lists homebrew files, skipping index and blocklist, flagging bad JSON', async () => {
    const listing = await source.listHomebrew();
    expect(listing.exists).toBe(true);
    expect(listing.files.map((f) => f.file)).toEqual([
      'Bad.json',
      'Kobold; Brew.json',
    ]);
    const [bad, good] = listing.files;
    expect(bad.error).toBeTruthy();
    expect(good).toMatchObject({ name: 'Kobold Brew', error: null });
    expect(good.counts).toEqual({ item: 1 });
    expect(good.size).toBeGreaterThan(0);
    expect(good.mtime).toBeGreaterThan(0);
  });

  it('reports a missing homebrew folder rather than throwing', async () => {
    const missing = new FsDataSource(
      { data: {}, schema: {}, guides: {}, homebrew: { path: 'nowhere' } },
      root,
    );
    expect((await missing.listHomebrew()).exists).toBe(false);
  });

  it('walks data files as sorted relative paths', async () => {
    expect(await source.listDataFiles()).toEqual([
      'generated/gendata-tables.json',
      'items.json',
      'spells/spells-phb.json',
      'tables.json',
    ]);
  });

  it('loads every parseable schema keyed by relative path', async () => {
    const schemas = await source.getSchemas();
    expect(Object.keys(schemas).sort()).toEqual([
      'entry/entry.json',
      'homebrew.json',
    ]);
  });

  it('lists only markdown guides, sorted', async () => {
    expect(await source.listGuides()).toEqual(['a.md', 'b.md']);
    expect(await source.getGuide('a.md')).toBe('# A');
  });

  it('rotates the old blocklist to .bak before writing', async () => {
    await source.writeBlocklistFile({ fresh: true });
    const dir = path.join(root, 'homebrew');
    expect(
      JSON.parse(
        await readFile(path.join(dir, 'content-blocklist.json'), 'utf8'),
      ),
    ).toEqual({ fresh: true });
    expect(
      JSON.parse(
        await readFile(path.join(dir, 'content-blocklist.json.bak'), 'utf8'),
      ),
    ).toEqual({ old: true });
  });

  it('caches parsed homebrew documents across calls and invalidates on edit or delete', async () => {
    const brewRoot = await mkdtemp(path.join(tmpdir(), 'hbm-cache-'));
    try {
      const brewDir = path.join(brewRoot, 'homebrew');
      await mkdir(brewDir, { recursive: true });
      const fileA = path.join(brewDir, 'Alpha.json');
      const fileB = path.join(brewDir, 'Beta.json');
      await writeFile(
        fileA,
        JSON.stringify({
          _meta: { sources: [{ full: 'Alpha' }] },
          item: [{ name: 'Sword' }],
          spell: [{ name: 'Spark' }],
        }),
      );
      await writeFile(
        fileB,
        JSON.stringify({
          _meta: { sources: [{ full: 'Beta' }] },
          item: [{ name: 'Shield' }],
        }),
      );
      const cached = new FsDataSource(
        { data: {}, schema: {}, guides: {}, homebrew: { path: 'homebrew' } },
        brewRoot,
      );

      const parseSpy = vi.spyOn(JSON, 'parse');
      try {
        // Concurrent calls share one in-flight scan and parse each file once.
        const [items, spells, listing] = await Promise.all([
          cached.getHomebrew('item'),
          cached.getHomebrew('spell'),
          cached.listHomebrew(),
        ]);
        expect(items.map((g) => g.file)).toEqual(['Alpha.json', 'Beta.json']);
        expect(spells.map((g) => g.file)).toEqual(['Alpha.json']);
        expect(listing.files.map((f) => f.file)).toEqual([
          'Alpha.json',
          'Beta.json',
        ]);
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // Subsequent reads reuse the cached docs with zero additional parses.
        const doc = await cached.readHomebrew('Alpha.json');
        expect((doc.item as { name: string }[])[0].name).toBe('Sword');
        await cached.getHomebrewCorpus();
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // Editing Alpha invalidates only Alpha; Beta stays cached.
        await writeFile(
          fileA,
          JSON.stringify({
            _meta: { sources: [{ full: 'Alpha v2' }] },
            item: [{ name: 'Greatsword' }],
          }),
        );
        const future = new Date(Date.now() + 5000);
        await utimes(fileA, future, future);

        const updated = await cached.readHomebrew('Alpha.json');
        expect((updated.item as { name: string }[])[0].name).toBe('Greatsword');
        expect(parseSpy).toHaveBeenCalledTimes(3);

        // Deleting Beta drops it from the corpus without re-parsing Alpha.
        await rm(fileB);
        const afterDelete = await cached.getHomebrewCorpus();
        expect(afterDelete.files.map((f) => f.file)).toEqual(['Alpha.json']);
        expect(parseSpy).toHaveBeenCalledTimes(3);
      } finally {
        parseSpy.mockRestore();
      }
    } finally {
      await rm(brewRoot, { recursive: true, force: true });
    }
  });

  it('caches listPartnered() with metaByFile and invalidates when index files change', async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'hbm-partnered-'));
    try {
      const genDir = path.join(repoRoot, 'repo', '_generated');
      await mkdir(genDir, { recursive: true });
      const metaPath = path.join(genDir, 'index-meta.json');
      const sourcesPath = path.join(genDir, 'index-sources.json');
      await writeFile(
        metaPath,
        JSON.stringify({
          'Partner.json': {
            n: ['Partner Book'],
            a: ['PB'],
            p: 1,
          },
          'Community.json': {
            n: ['Community Brew'],
            a: ['CB'],
          },
        }),
      );
      await writeFile(
        sourcesPath,
        JSON.stringify({ PB: 'collection/Partner.json' }),
      );

      const ds = new FsDataSource(
        {
          data: {},
          schema: {},
          guides: {},
          homebrew: {},
          partnered: { path: 'repo' },
        },
        repoRoot,
      );

      const parseSpy = vi.spyOn(JSON, 'parse');
      try {
        const [first, second] = await Promise.all([
          ds.listPartnered(),
          ds.listPartnered(),
        ]);
        expect(first.exists).toBe(true);
        expect(first.files).toHaveLength(1);
        expect(first.metaByFile['Community.json']).toEqual({
          names: ['Community Brew'],
          abbreviations: ['CB'],
        });
        expect(second).toBe(first);
        // 2 JSON files parsed once across concurrent calls.
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // Subsequent call hits stamp cache.
        const third = await ds.listPartnered();
        expect(third).toBe(first);
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // Updating index-meta.json invalidates the cache.
        await writeFile(
          metaPath,
          JSON.stringify({
            'Partner.json': {
              n: ['Partner Book Revised'],
              a: ['PB'],
              p: 1,
            },
          }),
        );
        const future = new Date(Date.now() + 5000);
        await utimes(metaPath, future, future);

        const fourth = await ds.listPartnered();
        expect(fourth.metaByFile['Partner.json'].names).toEqual([
          'Partner Book Revised',
        ]);
        expect(parseSpy).toHaveBeenCalledTimes(4);
      } finally {
        parseSpy.mockRestore();
      }
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('caches getOfficial() and parses shared multi-prop sources only once', async () => {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'hbm-official-cache-'));
    try {
      const dataDir = path.join(dataRoot, 'data');
      const classDir = path.join(dataDir, 'class');
      await mkdir(classDir, { recursive: true });
      await writeFile(
        path.join(dataDir, 'items.json'),
        JSON.stringify({
          item: [{ name: 'Bag of Holding', source: 'DMG' }],
          itemGroup: [{ name: 'Instrument of the Bards', source: 'DMG' }],
        }),
      );
      await writeFile(
        path.join(dataDir, 'items-base.json'),
        JSON.stringify({ baseitem: [{ name: 'Longsword', source: 'PHB' }] }),
      );
      await writeFile(
        path.join(dataDir, 'magicvariants.json'),
        JSON.stringify({ magicvariant: [] }),
      );
      await writeFile(
        path.join(classDir, 'index.json'),
        JSON.stringify({ fighter: 'class-fighter.json' }),
      );
      await writeFile(
        path.join(classDir, 'class-fighter.json'),
        JSON.stringify({
          class: [{ name: 'Fighter', source: 'PHB' }],
          subclass: [{ name: 'Champion', source: 'PHB' }],
          classFeature: [{ name: 'Action Surge', source: 'PHB' }],
          subclassFeature: [{ name: 'Improved Critical', source: 'PHB' }],
        }),
      );

      const ds = new FsDataSource(
        { data: { path: 'data' }, schema: {}, guides: {}, homebrew: {} },
        dataRoot,
      );

      const parseSpy = vi.spyOn(JSON, 'parse');
      try {
        // Requesting all four class props concurrently parses index.json + class-fighter.json once.
        const [classes, subclasses, classFeatures, subclassFeatures] =
          await Promise.all([
            ds.getOfficial('class'),
            ds.getOfficial('subclass'),
            ds.getOfficial('classFeature'),
            ds.getOfficial('subclassFeature'),
          ]);
        expect(classes).toHaveLength(1);
        expect(subclasses).toHaveLength(1);
        expect(classFeatures).toHaveLength(1);
        expect(subclassFeatures).toHaveLength(1);
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // Repeat requests hit the cache with zero additional parses.
        await ds.getOfficial('class');
        await ds.getOfficial('subclassFeature');
        expect(parseSpy).toHaveBeenCalledTimes(2);

        // composeItemCatalog parses items.json once for both item + itemGroup,
        // plus items-base.json and magicvariants.json (3 files total).
        parseSpy.mockClear();
        const catalog = await composeItemCatalog(ds);
        expect(catalog.map((e) => e.name).sort()).toEqual([
          'Bag of Holding',
          'Instrument of the Bards',
          'Longsword',
        ]);
        expect(parseSpy).toHaveBeenCalledTimes(3);

        // Subsequent composeItemCatalog reuses cached official arrays (0 official parses).
        parseSpy.mockClear();
        await composeItemCatalog(ds);
        expect(parseSpy).toHaveBeenCalledTimes(0);
      } finally {
        parseSpy.mockRestore();
      }
    } finally {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it('deduplicates concurrent in-flight readDataFile calls', async () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    try {
      const [a, b, c] = await Promise.all([
        source.readDataFile('tables.json'),
        source.readDataFile('tables.json'),
        source.readDataFile('tables.json'),
      ]);
      expect(a).toBe(b);
      expect(b).toBe(c);
      expect(parseSpy).toHaveBeenCalledTimes(1);
    } finally {
      parseSpy.mockRestore();
    }
  });
});
