/**
 * data/fs-source.ts — filesystem + HTTP fetch DataSource backed by lib/fs.
 *
 * Relative paths resolve against `root` (default process.cwd()). Homebrew docs
 * are cached by (mtime, size); official entity arrays are cached per instance
 * and dropped on `resetDataSource()`. Missing or malformed files yield empty
 * results rather than crashing callers.
 */
import {
  fs,
  path,
  readManyTextChunked,
  writeJsonWithBackup,
} from '../fs/index.ts';
import type { DirEntry } from '../fs/index.ts';
import { mapPool } from '../util.ts';
import type {
  DataSource,
  DataSourceConfig,
  SourceRef,
  HomebrewListing,
  HomebrewDocument,
  HomebrewCorpus,
  PartneredListing,
} from './source.ts';
import {
  IGNORED_HOMEBREW,
  OFFICIAL_SOURCES,
  loadOfficialProps,
  officialSiblingsFor,
  parseBlocklist,
} from './source.ts';
import { parsePartneredMeta, selectPartneredFiles } from './partnered.ts';
import { applyHomebrewJson, blankHomebrewMeta } from './homebrew-meta.ts';
import type { Entity, BlocklistLookup } from '../engine/types.ts';
import type { SchemaMap } from '../engine/audit/index.ts';

interface CachedBrew {
  mtime: number;
  size: number;
  entry: HomebrewDocument;
}

interface CachedPartnered {
  stamp: string;
  listing: PartneredListing;
}

export class FsDataSource implements DataSource {
  readonly kind = 'fs' as const;
  private cfg: DataSourceConfig;
  private root: string;
  private brewCache = new Map<string, CachedBrew>();
  private corpusInFlight: Promise<HomebrewCorpus> | null = null;
  private partneredCache: CachedPartnered | null = null;
  private partneredInFlight: Promise<PartneredListing> | null = null;
  private officialCache = new Map<string, Promise<Entity[]>>();
  private dataFileInFlight = new Map<
    string,
    Promise<Record<string, unknown> | null>
  >();

  constructor(cfg: DataSourceConfig, root: string = process.cwd()) {
    this.cfg = cfg;
    this.root = root;
  }

  // --- low-level read primitives (path → fs, url → fetch) ------------------

  private resolve(
    ref: SourceRef,
    relPath: string,
  ): { url?: string; file?: string } {
    if (ref.url) return { url: `${ref.url.replace(/\/$/, '')}/${relPath}` };
    const base = path.isAbsolute(ref.path || '')
      ? (ref.path as string)
      : path.resolve(this.root, ref.path || '.');
    return { file: path.join(base, relPath) };
  }

  private async readText(
    ref: SourceRef,
    relPath: string,
  ): Promise<string | null> {
    const loc = this.resolve(ref, relPath);
    try {
      if (loc.url) {
        const res = await fetch(loc.url);
        return res.ok ? await res.text() : null;
      }
      return await fs().readText(loc.file as string);
    } catch {
      return null;
    }
  }

  private async readJson(
    ref: SourceRef,
    relPath: string,
  ): Promise<Record<string, unknown> | null> {
    const text = await this.readText(ref, relPath);
    if (text == null) return null;
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** Absolute directory for a path-based ref, or null for url-based refs. */
  private dirOf(ref: SourceRef): string | null {
    if (ref.url || ref.path === undefined) return null;
    return path.isAbsolute(ref.path)
      ? ref.path
      : path.resolve(this.root, ref.path);
  }

  /** Read + parse one local homebrew file, reusing the cached doc while (mtime, size) match. */
  private async loadHomebrewEntry(
    dir: string,
    file: string,
    knownStat?: { size: number; mtimeMs: number },
  ): Promise<HomebrewDocument> {
    const full = path.join(dir, file);
    let st: { size: number; mtimeMs: number };
    if (knownStat) {
      st = knownStat;
    } else {
      try {
        st = await fs().stat(full);
      } catch (err) {
        this.brewCache.delete(file);
        const meta = blankHomebrewMeta(file);
        meta.error = (err as Error).message;
        return { file, meta, doc: null };
      }
    }
    const hit = this.brewCache.get(file);
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) {
      return hit.entry;
    }
    const meta = blankHomebrewMeta(file);
    meta.size = st.size;
    meta.mtime = st.mtimeMs;
    let doc: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(await fs().readText(full)) as Record<
        string,
        unknown
      >;
      applyHomebrewJson(meta, parsed);
      doc = parsed;
    } catch (err) {
      meta.error = (err as Error).message;
    }
    const entry: HomebrewDocument = { file, meta, doc };
    if (!IGNORED_HOMEBREW.has(file.toLowerCase())) {
      this.brewCache.set(file, { mtime: st.mtimeMs, size: st.size, entry });
    }
    return entry;
  }

  // --- DataSource implementation ------------------------------------------

  getOfficial(arrayProp: string): Promise<Entity[]> {
    const cached = this.officialCache.get(arrayProp);
    if (cached) return cached;
    const spec = OFFICIAL_SOURCES[arrayProp];
    if (!spec) return Promise.resolve([]);

    // Populate sibling props from the same backing file(s) in one pass (e.g.
    // items.json → item + itemGroup; class/*.json → class/subclass/features).
    const siblings = officialSiblingsFor(arrayProp);
    const props = siblings.map((key) => OFFICIAL_SOURCES[key].prop);
    const batch = loadOfficialProps(spec, props, (rel) =>
      this.readDataFile(rel),
    );
    batch.catch(() => {
      for (const key of siblings) this.officialCache.delete(key);
    });

    for (const key of siblings) {
      const prop = OFFICIAL_SOURCES[key].prop;
      this.officialCache.set(
        key,
        batch.then((byProp) => byProp[prop] ?? []),
      );
    }
    return this.officialCache.get(arrayProp)!;
  }

  getHomebrewCorpus(): Promise<HomebrewCorpus> {
    if (this.corpusInFlight) return this.corpusInFlight;
    const p = this.scanHomebrewCorpus().finally(() => {
      if (this.corpusInFlight === p) this.corpusInFlight = null;
    });
    this.corpusInFlight = p;
    return p;
  }

  private async scanHomebrewCorpus(): Promise<HomebrewCorpus> {
    const dir = this.dirOf(this.cfg.homebrew);
    if (!dir)
      return { path: this.cfg.homebrew.url ?? '', exists: false, files: [] };
    let entries: DirEntry[];
    try {
      entries = (await fs().readDir(dir)).filter(
        (e) =>
          e.isFile &&
          e.name.endsWith('.json') &&
          !IGNORED_HOMEBREW.has(e.name.toLowerCase()),
      );
    } catch {
      this.brewCache.clear();
      return { path: dir, exists: false, files: [] };
    }
    const present = new Set(entries.map((e) => e.name));
    for (const key of this.brewCache.keys()) {
      if (!present.has(key)) this.brewCache.delete(key);
    }
    const files = await mapPool(entries, (entry) =>
      this.loadHomebrewEntry(
        dir,
        entry.name,
        entry.size !== undefined && entry.mtimeMs !== undefined
          ? { size: entry.size, mtimeMs: entry.mtimeMs }
          : undefined,
      ),
    );
    files.sort((a, b) => a.file.localeCompare(b.file));
    return { path: dir, exists: true, files };
  }

  async getHomebrew(
    arrayProp: string,
  ): Promise<{ file: string; entities: Entity[] }[]> {
    const corpus = await this.getHomebrewCorpus();
    if (!corpus.exists) return [];
    const out: { file: string; entities: Entity[] }[] = [];
    for (const { file, doc } of corpus.files) {
      const arr = doc?.[arrayProp];
      if (Array.isArray(arr) && arr.length)
        out.push({ file, entities: arr as Entity[] });
    }
    return out;
  }

  async listHomebrew(): Promise<HomebrewListing> {
    const corpus = await this.getHomebrewCorpus();
    return {
      path: corpus.path,
      exists: corpus.exists,
      files: corpus.files.map((f) => f.meta),
    };
  }

  async readHomebrew(file: string): Promise<Record<string, unknown>> {
    const name = path.basename(file);
    const dir = this.dirOf(this.cfg.homebrew);
    if (dir) {
      const { doc } = await this.loadHomebrewEntry(dir, name);
      if (!doc) throw new Error(`Homebrew file not found or invalid: ${file}`);
      return doc;
    }
    const json = await this.readJson(this.cfg.homebrew, name);
    if (!json) throw new Error(`Homebrew file not found or invalid: ${file}`);
    return json;
  }

  /**
   * Partnered brews from a homebrew-repo checkout. The repo publishes the two
   * `_generated` indexes this needs (~240 KB together), so no directory walk is
   * required — and a missing or malformed index reads as "no partnered
   * content", never an error: this source is optional by design.
   */
  listPartnered(): Promise<PartneredListing> {
    if (this.partneredInFlight) return this.partneredInFlight;
    const p = this.loadPartnered().finally(() => {
      if (this.partneredInFlight === p) this.partneredInFlight = null;
    });
    this.partneredInFlight = p;
    return p;
  }

  private async loadPartnered(): Promise<PartneredListing> {
    const ref = this.cfg.partnered;
    const dir = ref ? this.dirOf(ref) : null;
    if (!dir)
      return {
        path: ref?.url ?? '',
        exists: false,
        files: [],
        sourcePaths: {},
        metaByFile: {},
      };
    const fileStamp = (rel: string): Promise<string> =>
      fs()
        .stat(path.join(dir, rel))
        .then(
          (st) => `${st.mtimeMs}:${st.size}`,
          () => 'missing',
        );
    const [metaStamp, sourcesStamp] = await Promise.all([
      fileStamp('_generated/index-meta.json'),
      fileStamp('_generated/index-sources.json'),
    ]);
    const stamp = `${metaStamp}|${sourcesStamp}`;
    if (this.partneredCache && this.partneredCache.stamp === stamp) {
      return this.partneredCache.listing;
    }
    const [meta, sources] = await Promise.all([
      this.readJson(ref as SourceRef, '_generated/index-meta.json'),
      this.readJson(ref as SourceRef, '_generated/index-sources.json'),
    ]);
    const metaByFile = meta ? parsePartneredMeta(meta) : {};
    const sourcePaths = sources
      ? Object.fromEntries(
          Object.entries(sources).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
    const listing: PartneredListing =
      meta && sources
        ? {
            path: dir,
            exists: true,
            files: selectPartneredFiles(meta, sources),
            sourcePaths,
            metaByFile,
          }
        : { path: dir, exists: false, files: [], sourcePaths, metaByFile };
    this.partneredCache = { stamp, listing };
    return listing;
  }

  async readPartnered(
    relPath: string,
  ): Promise<Record<string, unknown> | null> {
    const ref = this.cfg.partnered;
    if (!ref?.path && !ref?.url) return null;
    return this.readJson(ref, relPath);
  }

  async getBlocklist(): Promise<BlocklistLookup> {
    const json = await this.readJson(
      this.cfg.homebrew,
      'content-blocklist.json',
    );
    return parseBlocklist(json ?? {});
  }

  async readBlocklistFile(): Promise<Record<string, unknown> | null> {
    return this.readJson(this.cfg.homebrew, 'content-blocklist.json');
  }

  async writeBlocklistFile(
    json: Record<string, unknown>,
    opts: { backup?: boolean } = {},
  ): Promise<void> {
    const base = this.dirOf(this.cfg.homebrew);
    if (!base)
      throw new Error(
        'Homebrew source is a URL — cannot save the blocklist to it.',
      );
    await writeJsonWithBackup(
      path.join(base, 'content-blocklist.json'),
      json,
      opts,
    );
  }

  async listDataFiles(): Promise<string[]> {
    const root = this.dirOf(this.cfg.data);
    if (!root)
      throw new Error(
        'Data source is a URL — cannot enumerate it. Use a local path.',
      );
    return fs().walkFiles(root, '.json');
  }

  async readSiteFile(relPath: string): Promise<string | null> {
    return this.readText(this.cfg.data, `../${relPath}`);
  }

  readDataFile(relPath: string): Promise<Record<string, unknown> | null> {
    const running = this.dataFileInFlight.get(relPath);
    if (running) return running;
    const load = this.readJson(this.cfg.data, relPath).finally(() => {
      if (this.dataFileInFlight.get(relPath) === load) {
        this.dataFileInFlight.delete(relPath);
      }
    });
    this.dataFileInFlight.set(relPath, load);
    return load;
  }

  async readDataFiles(
    relPaths: readonly string[],
  ): Promise<(Record<string, unknown> | null)[]> {
    const dir = this.dirOf(this.cfg.data);
    if (!dir) return mapPool(relPaths, (rel) => this.readDataFile(rel));
    const texts = await readManyTextChunked(
      relPaths.map((rel) => path.join(dir, rel)),
    );
    return texts.map((text) => {
      if (text == null) return null;
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        return null;
      }
    });
  }

  async getSchemas(): Promise<SchemaMap> {
    const root = this.dirOf(this.cfg.schema);
    if (!root) return {};
    const files = await fs().walkFiles(root, '.json');
    const texts = await readManyTextChunked(
      files.map((rel) => path.join(root, rel)),
    );
    const cache: SchemaMap = {};
    for (let i = 0; i < files.length; i++) {
      const text = texts[i];
      if (text == null) continue;
      try {
        cache[files[i]] = JSON.parse(text);
      } catch {
        /* skip unparseable schema file */
      }
    }
    return cache;
  }

  async getGuide(file: string): Promise<string> {
    const text = await this.readText(this.cfg.guides, path.basename(file));
    if (text == null) throw new Error(`Guide not found: ${file}`);
    return text;
  }

  async listGuides(): Promise<string[]> {
    const dir = this.dirOf(this.cfg.guides);
    if (!dir) return [];
    try {
      return (await fs().readDir(dir))
        .map((e) => e.name)
        .filter((f) => f.endsWith('.md'))
        .sort();
    } catch {
      return [];
    }
  }
}
