/**
 * Keeps the working homebrew folder and its `index.json` matched, and builds
 * the Files view's listing (homebrew files, deploy availability, upstream
 * update hints, and index mismatches).
 *
 * The Files view is where brews come and go, so nothing here changes either
 * side until the user picks an action:
 *
 * - unlisted: a file in the folder that `toImport` doesn't name (added by
 *   hand). Keep lists it; Unused moves it into `unused/`.
 * - missing: a `toImport` entry with no file. Restore brings it back from
 *   `unused/`; Drop takes it off the list.
 *
 * Prepare reports the same mismatch in its log (pipeline.rs `check_index`)
 * but never fixes it, since that's what once swept every brew into unused/.
 */
import { fs, path } from '$lib/fs';
import { IGNORED_HOMEBREW, type HomebrewListing } from '$lib/data';
import { stringList } from '$lib/util';
import { getDataSource } from './datasource';
import {
  configuredDeployTargets,
  safeHomebrewFilename,
} from './homebrew-deploy';
import {
  liveFolders,
  updateIndex,
  upstreamUpdates,
  type UpstreamUpdate,
} from './homebrew-library';

export interface IndexMismatch {
  /** The working homebrew folder; empty when Settings names none. */
  path: string;
  unlisted: string[];
  missing: { file: string; inUnused: boolean }[];
}

export type MismatchAction = 'keep' | 'unused' | 'restore' | 'drop';

export interface HomebrewFiles {
  homebrew: HomebrewListing;
  canDeploy: boolean;
  /** Files the homebrew repo has a newer version of, by filename. */
  upstream: Record<string, UpstreamUpdate>;
  /** Null when the folder can't be read. */
  index: IndexMismatch | null;
}

/** Everything the Files view needs: file metadata, deploy availability, upstream hints, and index drift. */
export async function listHomebrewFiles(): Promise<HomebrewFiles> {
  const homebrew = await getDataSource()
    .listHomebrew()
    .catch((): HomebrewListing => ({ path: '', exists: false, files: [] }));
  return {
    homebrew,
    canDeploy: configuredDeployTargets().length > 0,
    upstream: await upstreamUpdates(homebrew.files),
    index: homebrew.exists ? await checkIndex().catch(() => null) : null,
  };
}

function workingFolder(): string {
  const dir = liveFolders()[0]?.path;
  if (!dir) throw new Error('No homebrew folder configured in Settings');
  return dir;
}

/** What the folder and its index disagree on. */
export async function checkIndex(
  dir: string = workingFolder(),
): Promise<IndexMismatch> {
  const entries = await fs().readDir(dir);
  const onDisk = new Set(
    entries
      .filter((e) => e.isFile && e.name.endsWith('.json'))
      .map((e) => e.name),
  );
  let index: { toImport?: unknown; notUsed?: unknown } = {};
  try {
    index = JSON.parse(await fs().readText(path.join(dir, 'index.json')));
  } catch {
    // No readable index means the site loads nothing: every brew is unlisted.
  }
  const listed = new Set(stringList(index.toImport));
  const notUsed = new Set(stringList(index.notUsed));
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

  const unlisted = [...onDisk]
    .filter(
      (f) =>
        !IGNORED_HOMEBREW.has(f.toLowerCase()) &&
        !listed.has(f) &&
        !notUsed.has(f),
    )
    .sort(byName);
  const gone = [...listed]
    .filter((f) => f !== 'index.json' && !onDisk.has(f))
    .sort(byName);
  const missing = await Promise.all(
    gone.map(async (file) => ({
      file,
      inUnused: await fs().exists(path.join(dir, 'unused', file)),
    })),
  );
  return { path: dir, unlisted, missing };
}

/** Settle one mismatch the way the user chose. */
export async function resolveMismatch(
  action: MismatchAction,
  file: string,
  dir: string = workingFolder(),
): Promise<void> {
  const name = safeHomebrewFilename(file);
  const here = path.join(dir, name);
  const parked = path.join(dir, 'unused', name);
  switch (action) {
    case 'keep':
      return updateIndex(dir, name, 'add');
    case 'unused':
      await fs().mkdir(path.join(dir, 'unused'));
      await fs().rename(here, parked);
      return updateIndex(dir, name, 'remove');
    case 'restore':
      await fs().rename(parked, here);
      return updateIndex(dir, name, 'add');
    case 'drop':
      return updateIndex(dir, name, 'remove');
    default:
      throw new Error('Unknown action');
  }
}
