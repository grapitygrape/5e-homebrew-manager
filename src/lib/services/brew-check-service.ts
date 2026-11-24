/**
 * lib/services/brew-check-service.ts — collisions and submission lint, over
 * real data.
 *
 * INTENT
 *   The engine halves (audit/collisions, audit/submission-lint) are pure; this
 *   supplies what they need and memoizes the expensive parts:
 *     - the brew corpus (from FsDataSource's shared mtime-cached corpus),
 *     - official identity keys (every OFFICIAL_SOURCES prop),
 *     - the site's source lists (from the brew schema folder),
 *     - the homebrew repo's `_generated/index-sources.json` (optional).
 *   The `_copy`/`_versions` preview lives in preview-service.ts. Every cache
 *   here is dropped by resetDataSource(), or on demand by resetBrewChecks().
 */
import { cachedResource, getDataSource } from './datasource';
import { getSchemasCached } from './schema-service';
import { OFFICIAL_SOURCES } from '$lib/data';
import {
  readSiteSources,
  findCollisions,
  collisionsForFile,
  buildOfficialKeys,
  lintSubmission,
} from '$lib/engine/audit';
import type {
  SiteSources,
  CollisionReport,
  Collision,
  LintReport,
} from '$lib/engine/audit';
import type { Entity } from '$lib/engine/types';

type Doc = Record<string, unknown>;

// --- shared inputs ------------------------------------------------------------------

export async function getSiteSources(): Promise<SiteSources> {
  return readSiteSources(await getSchemasCached().catch(() => ({})));
}

/** Every readable homebrew file, from the DataSource's mtime-cached corpus. */
export async function getBrewCorpus(): Promise<{ file: string; doc: Doc }[]> {
  const corpus = await getDataSource()
    .getHomebrewCorpus()
    .catch(() => null);
  const out: { file: string; doc: Doc }[] = [];
  for (const { file, doc } of corpus?.files ?? []) {
    if (doc) out.push({ file, doc });
  }
  return out;
}

const officialKeysCache = cachedResource<Map<string, Set<string>>>(async () => {
  const byProp: Record<string, Entity[]> = {};
  const ds = getDataSource();
  await Promise.all(
    Object.keys(OFFICIAL_SOURCES).map(async (prop) => {
      byProp[prop] = await ds.getOfficial(prop).catch(() => [] as Entity[]);
    }),
  );
  return buildOfficialKeys(byProp);
});

/** The homebrew repo's source index (json id → repo path); {} when unconfigured. */
async function getRepoSources(): Promise<Record<string, string>> {
  return (
    (
      await getDataSource()
        .listPartnered()
        .catch(() => null)
    )?.sourcePaths ?? {}
  );
}

// --- collisions -----------------------------------------------------------------------

const collisionsCache = cachedResource<CollisionReport>(async () => {
  const [files, official, site, repoSources] = await Promise.all([
    getBrewCorpus(),
    officialKeysCache.get(),
    getSiteSources(),
    getRepoSources(),
  ]);
  return findCollisions({
    files,
    officialKeys: official,
    site,
    repoSources,
  });
});

export const getCollisionReport = (force = false): Promise<CollisionReport> =>
  collisionsCache.get(force);

/**
 * Collisions for one document. For a file already in the corpus this is a
 * filter of the cached report; for an edited/unsaved doc, the doc replaces
 * its on-disk version and the check reruns (cheap — no official reload).
 */
export async function collisionsForDoc(
  file: string,
  doc?: Doc,
): Promise<Collision[]> {
  if (!doc) return collisionsForFile(await getCollisionReport(), file);
  const [files, official, site, repoSources] = await Promise.all([
    getBrewCorpus(),
    officialKeysCache.get(),
    getSiteSources(),
    getRepoSources(),
  ]);
  const report = findCollisions({
    files: [...files.filter((f) => f.file !== file), { file, doc }],
    officialKeys: official,
    site,
    repoSources,
  });
  return collisionsForFile(report, file);
}

// --- submission lint ------------------------------------------------------------------------

export interface FileCheck {
  lint: LintReport;
  collisions: Collision[];
}

export async function checkSubmission(
  file: string,
  doc?: Doc,
  raw?: string,
): Promise<FileCheck> {
  const data = doc ?? (await getDataSource().readHomebrew(file));
  const [site, cols] = await Promise.all([
    getSiteSources(),
    collisionsForDoc(file, doc),
  ]);
  return {
    lint: lintSubmission({ file, doc: data, raw, site }),
    collisions: cols,
  };
}

export function resetBrewChecks(): void {
  officialKeysCache.reset();
  collisionsCache.reset();
}
