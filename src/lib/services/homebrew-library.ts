/**
 * Add brews from the homebrew-repo checkout (Settings' "partnered" path) into
 * the live homebrew folders, and retire them again.
 *
 * "Live folders" are the working homebrew folder plus Deployed homebrew: both
 * are 5etools `homebrew/` dirs with their own `index.json`, whose `toImport`
 * list is what the site actually loads. Foundry homebrew has no index and isn't
 * a 5etools site, so it's left alone here — Deploy still covers it.
 *
 * Add copies `<repo>/<type>/<file>` into each folder and lists it in
 * `toImport`. Remove moves the file into that folder's `unused/` and drops it
 * from `toImport`, so it can be brought back by hand.
 */
import { fs, path } from '$lib/fs';
import { FsDataSource, type RepoFileMeta } from '$lib/data';
import { stringList } from '$lib/util';
import { configProvider } from './config';
import { getDataSource } from './datasource';
import {
  configuredDeployTargets,
  localDeployPath,
  resolveLocalDir,
  safeHomebrewFilename,
} from './homebrew-deploy';
import type { DeployDestination } from './homebrew-deploy';

/** One brew in the repo checkout. */
export interface CatalogEntry {
  /** Basename, e.g. `Kobold Press; Tome of Beasts 2.json`. */
  file: string;
  /** Repo type folder it lives in (`creature`, `class`, …). */
  folder: string;
  /** Full source names from `index-meta.json`; empty if unindexed. */
  names: string[];
  /** Source abbreviations from `index-meta.json`. */
  abbreviations: string[];
}

export interface LibraryResult {
  done: string[];
  errors: { label: string; path: string; message: string }[];
}

/** A repo brew as the Add a homebrew file view lists it. */
export interface LibraryEntry extends CatalogEntry {
  installed: boolean;
  /** The part of the filename before "; ", per the repo's naming rule. */
  authors: string;
  /** Last modified per the repo's index-timestamps.json (ms); 0 if unlisted. */
  mtime: number;
  size: number;
}

export interface LibraryListing {
  path: string;
  entries: LibraryEntry[];
}

type TimestampIndex = Record<string, { m?: unknown }>;

const sameDir = (a: string, b: string): boolean =>
  Boolean(a) &&
  path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();

/** Reuse the shared DataSource's `listPartnered()` when `repoDir` matches its configured repo. */
async function readMetaByFile(
  repoDir: string,
): Promise<Record<string, RepoFileMeta>> {
  try {
    const shared = await getDataSource().listPartnered();
    if (sameDir(shared.path, repoDir)) return shared.metaByFile;
  } catch {
    // Fall through to a scoped FsDataSource for standalone callers/tests.
  }
  const scoped = new FsDataSource(
    {
      data: {},
      schema: {},
      guides: {},
      homebrew: {},
      partnered: { path: repoDir },
    },
    repoDir,
  );
  return (await scoped.listPartnered()).metaByFile;
}

/**
 * Every brew in the repo, walked from its type folders rather than read from
 * `index-sources.json` — that index only lists files with a source code, and a
 * brew it misses should still be findable.
 */
export async function listCatalog(repoDir: string): Promise<CatalogEntry[]> {
  const meta = await readMetaByFile(repoDir).catch(
    (): Record<string, RepoFileMeta> => ({}),
  );
  const out: CatalogEntry[] = [];
  const folders = await fs().readDir(repoDir);
  for (const dir of folders) {
    if (
      !dir.isDirectory ||
      /^[._]/.test(dir.name) ||
      dir.name === 'node_modules'
    )
      continue;
    const files = await fs().readDir(path.join(repoDir, dir.name));
    for (const f of files) {
      if (!f.isFile || !f.name.endsWith('.json')) continue;
      const m = meta[f.name];
      out.push({
        file: f.name,
        folder: dir.name,
        names: m?.names ?? [],
        abbreviations: m?.abbreviations ?? [],
      });
    }
  }
  out.sort((a, b) => a.file.localeCompare(b.file));
  return out;
}

/** Add or drop one filename in a folder's `index.json` `toImport` list. */
export async function updateIndex(
  dir: string,
  file: string,
  action: 'add' | 'remove',
): Promise<void> {
  const indexPath = path.join(dir, 'index.json');
  const index = JSON.parse(await fs().readText(indexPath)) as {
    toImport?: unknown;
  };
  const list = stringList(index.toImport);
  const has = list.includes(file);
  if (action === 'add' && has) return;
  if (action === 'remove' && !has) return;
  const next =
    action === 'add' ? [...list, file] : list.filter((f) => f !== file);
  // Ordinal sort, matching how the existing list is ordered.
  next.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  index.toImport = next;
  await fs().writeText(indexPath, `${JSON.stringify(index, null, '\t')}\n`);
}

async function requireFolder(dir: string): Promise<void> {
  const st = await fs().stat(dir);
  if (!st.isDirectory) throw new Error('Not a folder');
}

/** `<repo>/<folder>/<file>`, refusing anything that could leave the repo. */
function repoFilePath(repo: string, folder: string, file: string): string {
  const name = safeHomebrewFilename(file);
  const dir = (folder ?? '').trim();
  if (!dir || dir !== path.basename(dir) || /^[._]/.test(dir)) {
    throw new Error('Invalid repo folder');
  }
  return path.join(repo, dir, name);
}

export async function addFromRepo(opts: {
  repoDir: string;
  folder: string;
  file: string;
  destinations: DeployDestination[];
}): Promise<LibraryResult> {
  const src = repoFilePath(opts.repoDir, opts.folder, opts.file);
  const file = path.basename(src);
  const folder = opts.folder.trim();
  try {
    await fs().stat(src);
  } catch {
    throw new Error(`Not in the homebrew repo: ${folder}/${file}`);
  }
  const done: string[] = [];
  const errors: LibraryResult['errors'] = [];
  for (const dest of opts.destinations) {
    try {
      await requireFolder(dest.path);
      await fs().copyFile(src, path.join(dest.path, file));
      await updateIndex(dest.path, file, 'add');
      done.push(dest.path);
    } catch (e) {
      errors.push({
        label: dest.label,
        path: dest.path,
        message: (e as Error).message,
      });
    }
  }
  return { done, errors };
}

export async function retireToUnused(opts: {
  file: string;
  destinations: DeployDestination[];
}): Promise<LibraryResult> {
  const file = safeHomebrewFilename(opts.file);
  const done: string[] = [];
  const errors: LibraryResult['errors'] = [];
  for (const dest of opts.destinations) {
    try {
      await requireFolder(dest.path);
      const unused = path.join(dest.path, 'unused');
      await fs().mkdir(unused);
      const src = path.join(dest.path, file);
      // A folder that never had the file still gets its index cleaned up.
      if (await fs().exists(src))
        await fs().rename(src, path.join(unused, file));
      await updateIndex(dest.path, file, 'remove');
      done.push(dest.path);
    } catch (e) {
      errors.push({
        label: dest.label,
        path: dest.path,
        message: (e as Error).message,
      });
    }
  }
  return { done, errors };
}

/** The working homebrew folder, then every homebrew deploy folder. */
export function liveFolders(): DeployDestination[] {
  const { effectiveConfig } = configProvider();
  const out: DeployDestination[] = [];
  const hb = localDeployPath(effectiveConfig().homebrew.path);
  if (hb) out.push({ label: 'Homebrew', path: resolveLocalDir(hb) });
  return [...out, ...configuredDeployTargets()];
}

/** Settings' homebrew-repo checkout. Throws when none is set. */
export function repoDir(): string {
  const repo = localDeployPath(
    configProvider().effectiveConfig().partnered?.path,
  );
  if (!repo) throw new Error('No homebrew repo path configured in Settings');
  return resolveLocalDir(repo);
}

async function readCatalog(dir: string): Promise<CatalogEntry[]> {
  try {
    return await listCatalog(dir);
  } catch (e) {
    throw new Error(`Homebrew repo not readable: ${(e as Error).message}`);
  }
}

/** Filenames already in the working homebrew folder. */
async function installedNames(): Promise<Set<string>> {
  const working = liveFolders()[0];
  const entries = working
    ? await fs()
        .readDir(working.path)
        .catch(() => [])
    : [];
  return new Set(entries.map((e) => e.name));
}

/**
 * Every brew in the repo checkout, for the Add view. Dates come from the
 * repo's own timestamp index because a fresh clone gives every file today's
 * mtime.
 */
export async function listLibrary(
  dir: string = repoDir(),
): Promise<LibraryListing> {
  const catalog = await readCatalog(dir);
  let stamps: TimestampIndex = {};
  try {
    stamps = await readStamps(dir);
  } catch {
    // Without it the list still works; Last updated just can't order it.
  }
  const installed = await installedNames();
  const entries = await Promise.all(
    catalog.map(async (entry): Promise<LibraryEntry> => {
      const m = stamps[`${entry.folder}/${entry.file}`]?.m;
      const semi = entry.file.indexOf('; ');
      const size = await fs()
        .stat(path.join(dir, entry.folder, entry.file))
        .then((st) => st.size)
        .catch(() => 0);
      return {
        ...entry,
        installed: installed.has(entry.file),
        authors: semi > 0 ? entry.file.slice(0, semi) : '',
        mtime: typeof m === 'number' ? m * 1000 : 0,
        size,
      };
    }),
  );
  return { path: dir, entries };
}

/** A local brew the homebrew repo has a newer version of. */
export interface UpstreamUpdate {
  /** Repo type folder the newer version lives in. */
  folder: string;
  /** Upstream's last change (Unix seconds, from index-timestamps.json). */
  updated: number;
  /** The local copy's `_meta.dateLastModified` (Unix seconds). */
  local: number;
}

/**
 * Local files whose repo version changed after the local copy's own
 * `dateLastModified`. Editing such a copy and sending it back would undo
 * upstream's changes. Files without a date, or not in the repo, are skipped:
 * there's nothing to compare.
 */
export function findUpstreamUpdates(
  files: { file: string; dateLastModified: number }[],
  catalog: CatalogEntry[],
  stamps: TimestampIndex,
): Record<string, UpstreamUpdate> {
  const newest = new Map<string, { folder: string; updated: number }>();
  for (const entry of catalog) {
    const m = stamps[`${entry.folder}/${entry.file}`]?.m;
    if (typeof m !== 'number') continue;
    const prev = newest.get(entry.file);
    if (!prev || m > prev.updated)
      newest.set(entry.file, { folder: entry.folder, updated: m });
  }
  const out: Record<string, UpstreamUpdate> = {};
  for (const f of files) {
    const up = newest.get(f.file);
    if (up && f.dateLastModified > 0 && up.updated > f.dateLastModified)
      out[f.file] = { ...up, local: f.dateLastModified };
  }
  return out;
}

async function readStamps(dir: string): Promise<TimestampIndex> {
  return JSON.parse(
    await fs().readText(path.join(dir, '_generated', 'index-timestamps.json')),
  ) as TimestampIndex;
}

/**
 * The Files view's upstream check. Empty when Settings names no repo or the
 * repo can't be read; this is a hint, never a reason to fail the listing.
 */
export async function upstreamUpdates(
  files: { file: string; dateLastModified: number }[],
): Promise<Record<string, UpstreamUpdate>> {
  try {
    const dir = repoDir();
    const [catalog, stamps] = await Promise.all([
      listCatalog(dir),
      readStamps(dir),
    ]);
    return findUpstreamUpdates(files, catalog, stamps);
  } catch {
    return {};
  }
}

/** One repo brew's parsed JSON. */
export async function readLibraryFile(
  folder: string,
  file: string,
  dir: string = repoDir(),
): Promise<Record<string, unknown>> {
  const src = repoFilePath(dir, folder, file);
  let text: string;
  try {
    text = await fs().readText(src);
  } catch {
    throw new Error(`Not in the homebrew repo: ${folder}/${file}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function requireLiveFolders(): DeployDestination[] {
  const destinations = liveFolders();
  if (!destinations.length)
    throw new Error('No local homebrew folders configured');
  return destinations;
}

/** addFromRepo into the configured live folders. */
export async function addToLiveFolders(
  folder: string,
  file: string,
): Promise<LibraryResult> {
  const destinations = requireLiveFolders();
  return addFromRepo({ repoDir: repoDir(), folder, file, destinations });
}

/** retireToUnused across the configured live folders. */
export async function retireFromLiveFolders(
  file: string,
): Promise<LibraryResult> {
  return retireToUnused({ file, destinations: requireLiveFolders() });
}
