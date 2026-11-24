/**
 * lib/api/release.ts — Deploy Site's Review: gather every check's result for
 * the candidate Prepare built, and regenerate the guide lists.
 *
 * Works in both the Tauri desktop app and web/container mode (`hm-backend` +
 * SvelteKit server). Each check runs on its own, so one that can't run shows
 * as such instead of hiding the rest.
 */
import { getCollisions } from './checks';
import { runGuideAudit } from './dashboard';
import { listHomebrewFiles } from './homebrew';
import { getJson, postJson, rpc } from './transport';
import {
  checkScriptNames,
  getLastDeployRun,
  getLastPrepare,
  getReposOverview,
  listDeployModules,
  type DeployModule,
  type LastDeployRun,
  type LastPrepare,
} from '$lib/tauri-bridge';
import { resetDataSource } from '$lib/services/datasource';
import {
  checkGuideLists,
  type GuideListsReport,
} from '$lib/services/guide-list-service';
import {
  judgeRelease,
  type Outcome,
  type ReleaseCheck,
} from '$lib/services/release-checks';
import { errorText } from '$lib/util';

export interface ReleaseReview {
  prepare: LastPrepare | null;
  published: LastDeployRun | null;
  /** Prepared since the last publish, so the candidate isn't live yet. */
  unpublished: boolean;
  /** Empty until something has been prepared. */
  checks: ReleaseCheck[];
}

const settle = <T>(p: Promise<T>): Promise<Outcome<T>> =>
  p.catch((e: unknown) => ({ error: errorText(e) }));

/** Guides the audit fails: coverage, stale names, or a weak schema branch. */
async function failingGuides(): Promise<{ failing: string[] }> {
  const report = await runGuideAudit(true);
  const failing = new Set(
    report.summary
      .filter((r) => r.coverage < 100 || r.extra > 0)
      .map((r) => r.guide),
  );
  for (const [guide, b] of Object.entries(report.branched))
    if (b.coverage < 100) failing.add(guide);
  return { failing: [...failing].sort() };
}

const readGuideLists = (): Promise<GuideListsReport> =>
  rpc(
    () => checkGuideLists(false),
    () => getJson<GuideListsReport>('/api/guides/lists'),
  );

export async function reviewRelease(): Promise<ReleaseReview> {
  const [prepare, published] = await Promise.all([
    getLastPrepare(),
    getLastDeployRun(),
  ]);
  const unpublished = !!prepare && (!published || prepare.at > published.at);
  if (!prepare) return { prepare, published, unpublished, checks: [] };

  // Prepare may have moved the schemas and brews under the cached copies.
  resetDataSource();
  const [
    modules,
    overview,
    scriptNames,
    brews,
    guides,
    guideLists,
    collisions,
  ] = await Promise.all([
    listDeployModules().catch((): DeployModule[] => []),
    getReposOverview().catch(() => null),
    settle(checkScriptNames()),
    settle(
      listHomebrewFiles().then(({ homebrew }) =>
        homebrew.files.map((f) => ({ file: f.file, error: f.error })),
      ),
    ),
    settle(failingGuides()),
    settle(readGuideLists()),
    settle(getCollisions(true).then((r) => ({ errors: r.totals.errors }))),
  ]);
  const checks = judgeRelease({
    prepare,
    published,
    moduleTitles: Object.fromEntries(modules.map((m) => [m.id, m.title])),
    scriptNames,
    brews,
    guides,
    guideLists,
    collisions,
    schemaSync: overview?.schemaSync ?? null,
  });
  return { prepare, published, unpublished, checks };
}

/** Rewrite every stale list in the guides from the current schemas. */
export const regenerateGuideLists = (): Promise<GuideListsReport> =>
  rpc(
    () => checkGuideLists(true),
    () => postJson<GuideListsReport>('/api/guides/lists', {}),
  );
