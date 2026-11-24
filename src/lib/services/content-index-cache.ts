/**
 * Persistent disk cache for the ContentIndex (`{configRoot}/.cache/content-index.v1.json`).
 *
 * Avoids re-parsing ~300 files (~28 MB) on cold app startups when the official
 * data repo, homebrew folder, and partnered indexes are unchanged.
 */
import { fs, path } from '$lib/fs';
import { IGNORED_HOMEBREW, type DataSourceConfig } from '$lib/data';
import { entityGraphKey, type IndexedEntity } from '$lib/engine/blocklist';
import { mapPool } from '$lib/util';
import type { SourceSummary } from './content-index-service';

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'content-index.v1.json';
const MAX_NON_GIT_STAT_FILES = 32;

export interface ContentIndexSnapshot {
  version: typeof CACHE_VERSION;
  stamp: string;
  sources: SourceSummary[];
  entityCount: number;
  duplicateEntities: number;
  fileCount: number;
  builtAt: number;
  skipped: string[];
  /** `[prop, source, hash, name]` tuples. */
  entities: [string, string, string, string][];
  /** `[parentProp, parentHash, childProp, childHash]` tuples. */
  edges: [string, string, string, string][];
}

export interface HydratedIndexData {
  sources: SourceSummary[];
  bySource: Map<string, Map<string, IndexedEntity[]>>;
  byPropHash: Map<string, Map<string, IndexedEntity>>;
  childrenByParent: Map<string, IndexedEntity[]>;
  parents: Map<string, IndexedEntity>;
  entityCount: number;
  duplicateEntities: number;
  fileCount: number;
  builtAt: number;
  skipped: string[];
}

const resolveDir = (
  root: string,
  ref?: { path?: string; url?: string },
): string | null => {
  if (!ref?.path || ref.url) return null;
  return path.isAbsolute(ref.path) ? ref.path : path.resolve(root, ref.path);
};

const statToken = (file: string): Promise<string> =>
  fs()
    .stat(file)
    .then(
      (st) => `${st.size}:${st.mtimeMs}`,
      () => 'missing',
    );

/** Read a git repo's HEAD commit (or ref stamp), or null when `repoDir` is not a git checkout. */
async function readGitHead(repoDir: string): Promise<string | null> {
  const gitDir = path.join(repoDir, '.git');
  const head = await fs()
    .readText(path.join(gitDir, 'HEAD'))
    .catch(() => null);
  if (!head) return null;
  const trimmed = head.trim();
  if (!trimmed.startsWith('ref:')) return trimmed;
  const refPath = trimmed.slice(4).trim();
  const direct = await fs()
    .readText(path.join(gitDir, refPath))
    .catch(() => null);
  if (direct) return `${refPath}=${direct.trim()}`;
  const packed = await statToken(path.join(gitDir, 'packed-refs'));
  return `${refPath}@packed:${packed}`;
}

async function stampDataDir(
  dataDir: string,
  dataFiles: readonly string[],
): Promise<string | null> {
  const gitHead = await readGitHead(path.dirname(dataDir));
  if (gitHead) {
    const probes = await Promise.all([
      statToken(path.join(dataDir, 'items.json')),
      statToken(path.join(dataDir, 'books.json')),
      statToken(path.join(dataDir, 'races.json')),
    ]);
    return `git:${gitHead}|n:${dataFiles.length}|${probes.join(',')}`;
  }
  if (dataFiles.length > MAX_NON_GIT_STAT_FILES) return null;
  const tokens = await mapPool(
    dataFiles,
    async (rel) => `${rel}=${await statToken(path.join(dataDir, rel))}`,
  );
  return `files:${tokens.join('|')}`;
}

async function stampHomebrewDir(dir: string | null): Promise<string> {
  if (!dir) return 'none';
  let entries;
  try {
    entries = (await fs().readDir(dir)).filter(
      (e) =>
        e.isFile &&
        e.name.endsWith('.json') &&
        !IGNORED_HOMEBREW.has(e.name.toLowerCase()),
    );
  } catch {
    return 'missing';
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const tokens = await mapPool(entries, async (e) => {
    if (e.size !== undefined && e.mtimeMs !== undefined) {
      return `${e.name}:${e.size}:${e.mtimeMs}`;
    }
    return `${e.name}:${await statToken(path.join(dir, e.name))}`;
  });
  return tokens.join('|');
}

async function stampPartneredDir(dir: string | null): Promise<string> {
  if (!dir) return 'none';
  const [meta, sources, head] = await Promise.all([
    statToken(path.join(dir, '_generated', 'index-meta.json')),
    statToken(path.join(dir, '_generated', 'index-sources.json')),
    readGitHead(dir),
  ]);
  return `${meta}|${sources}|${head ?? ''}`;
}

export async function computeCorpusStamp(
  configRoot: string,
  cfg: DataSourceConfig,
  dataFiles: readonly string[],
): Promise<string | null> {
  const dataDir = resolveDir(configRoot, cfg.data);
  if (!dataDir) return null;
  const homebrewDir = resolveDir(configRoot, cfg.homebrew);
  const partneredDir = resolveDir(configRoot, cfg.partnered);

  const [dataStamp, brewStamp, partneredStamp] = await Promise.all([
    stampDataDir(dataDir, dataFiles),
    stampHomebrewDir(homebrewDir),
    stampPartneredDir(partneredDir),
  ]);
  if (!dataStamp) return null;

  return JSON.stringify({
    v: CACHE_VERSION,
    dataDir,
    homebrewDir,
    partneredDir,
    dataStamp,
    brewStamp,
    partneredStamp,
  });
}

export const contentIndexCachePath = (configRoot: string): string =>
  path.join(configRoot, '.cache', CACHE_FILENAME);

export async function readContentIndexCache(
  configRoot: string,
  expectedStamp: string,
): Promise<ContentIndexSnapshot | null> {
  try {
    const raw = await fs().readText(contentIndexCachePath(configRoot));
    const parsed = JSON.parse(raw) as Partial<ContentIndexSnapshot>;
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.stamp !== expectedStamp ||
      !Array.isArray(parsed.sources) ||
      !Array.isArray(parsed.entities) ||
      !Array.isArray(parsed.edges)
    ) {
      return null;
    }
    return parsed as ContentIndexSnapshot;
  } catch {
    return null;
  }
}

export async function writeContentIndexCache(
  configRoot: string,
  snapshot: ContentIndexSnapshot,
): Promise<void> {
  try {
    const target = contentIndexCachePath(configRoot);
    await fs().mkdir(path.dirname(target));
    await fs().writeText(target, JSON.stringify(snapshot));
  } catch {
    /* best-effort cache: read-only dirs must not break indexing */
  }
}

export function serializeContentIndex(
  stamp: string,
  data: HydratedIndexData,
): ContentIndexSnapshot {
  const entities: [string, string, string, string][] = [];
  for (const byProp of data.bySource.values()) {
    for (const list of byProp.values()) {
      for (const e of list) entities.push([e.prop, e.source, e.hash, e.name]);
    }
  }
  const edges: [string, string, string, string][] = [];
  for (const [parentKey, children] of data.childrenByParent) {
    const parent = data.parents.get(parentKey);
    if (!parent) continue;
    for (const child of children) {
      edges.push([parent.prop, parent.hash, child.prop, child.hash]);
    }
  }
  return {
    version: CACHE_VERSION,
    stamp,
    sources: data.sources,
    entityCount: data.entityCount,
    duplicateEntities: data.duplicateEntities,
    fileCount: data.fileCount,
    builtAt: data.builtAt,
    skipped: data.skipped,
    entities,
    edges,
  };
}

export function hydrateContentIndexSnapshot(
  snap: ContentIndexSnapshot,
): HydratedIndexData {
  const bySource = new Map<string, Map<string, IndexedEntity[]>>();
  const byPropHash = new Map<string, Map<string, IndexedEntity>>();

  for (const [prop, source, hash, name] of snap.entities) {
    const entry: IndexedEntity = { prop, source, hash, name };
    const key = source.toLowerCase();
    let byProp = bySource.get(key);
    if (!byProp) {
      byProp = new Map();
      bySource.set(key, byProp);
    }
    const list = byProp.get(prop);
    if (list) list.push(entry);
    else byProp.set(prop, [entry]);

    let hashes = byPropHash.get(prop);
    if (!hashes) {
      hashes = new Map();
      byPropHash.set(prop, hashes);
    }
    if (!hashes.has(hash)) hashes.set(hash, entry);
  }

  const childrenByParent = new Map<string, IndexedEntity[]>();
  const parents = new Map<string, IndexedEntity>();
  for (const [parentProp, parentHash, childProp, childHash] of snap.edges) {
    const parent = byPropHash.get(parentProp)?.get(parentHash);
    const child = byPropHash.get(childProp)?.get(childHash);
    if (!parent || !child) continue;
    const pKey = entityGraphKey(parent.prop, parent.hash);
    if (!parents.has(pKey)) parents.set(pKey, parent);
    const list = childrenByParent.get(pKey);
    if (list) list.push(child);
    else childrenByParent.set(pKey, [child]);
  }

  return {
    sources: snap.sources,
    bySource,
    byPropHash,
    childrenByParent,
    parents,
    entityCount: snap.entityCount,
    duplicateEntities: snap.duplicateEntities,
    fileCount: snap.fileCount,
    builtAt: snap.builtAt,
    skipped: snap.skipped,
  };
}
