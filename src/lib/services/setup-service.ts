/**
 * lib/services/setup-service.ts — what the setup screen starts from and what
 * finishing it writes.
 *
 * INTENT
 *   The draft comes from `sourceRepos` when setup has run before, else from
 *   the sources an older config already points at, so an existing install
 *   opens setup prefilled. Finishing writes the repos, the sources they feed,
 *   the deploy lists and the completed marker in one save. Guides and the
 *   other app settings are left as they are.
 */
import {
  SOURCE_REPOS,
  commonParent,
  derivedSources,
  legacyRepoPaths,
  siteHomebrewFolders,
  withoutPaths,
} from '$lib/data';
import type { SourceRepo, SourceRepoId, SourceRepos } from '$lib/data';
import { configProvider } from './config';
import { resetDataSource } from './datasource';

export interface SetupDraft {
  repos: Record<SourceRepoId, SourceRepo>;
  parent: string;
  siteDeployFolders: string[];
  homebrewDeployFolders: string[];
}

export function setupCompleted(): boolean {
  return !!configProvider().stored().setup?.completedAt;
}

function isContainerRuntime(): boolean {
  return (
    typeof process !== 'undefined' && process.env?.HBM_CONTAINER === '1'
  );
}

const CONTAINER_REPO_PATHS: Record<SourceRepoId, string> = {
  tools: '/data/repos/5e',
  siteImages: '/data/repos/5e-img',
  homebrew: '/data/repos/5e-homebrew',
  images: '/data/repos/homebrew-img',
  utils: '/data/repos/5e-utils',
};

export function setupDraft(): SetupDraft {
  const provider = configProvider();
  const stored = provider.stored().sourceRepos;
  const isContainer = isContainerRuntime();
  const legacy = legacyRepoPaths(provider.effectiveConfig());
  const repos = {} as Record<SourceRepoId, SourceRepo>;
  for (const { id } of SOURCE_REPOS) {
    repos[id] = stored
      ? { url: stored[id]?.url ?? '', path: stored[id]?.path ?? '' }
      : {
          url: '',
          path: isContainer ? CONTAINER_REPO_PATHS[id] : legacy[id],
        };
  }
  const app = provider.effectiveAppSettings();
  const siteDeployFolders =
    app.siteDeployFolders.length > 0
      ? app.siteDeployFolders
      : isContainer
        ? ['/data/site']
        : [];
  const rawParent = commonParent(Object.values(repos).map((r) => r.path));
  const parent =
    !stored && isContainer
      ? '/data/repos'
      : rawParent && Object.values(repos).some((r) => r.path.trim().startsWith('/'))
        ? `/${rawParent.replace(/^\/+/, '')}`
        : rawParent;
  return {
    repos,
    parent,
    siteDeployFolders,
    // Each site folder's homebrew/ is added on finish, so it isn't listed here.
    homebrewDeployFolders: withoutPaths(
      app.homebrewDeployFolders,
      siteHomebrewFolders(siteDeployFolders),
    ),
  };
}

const cleanList = (list: string[]) => list.map((s) => s.trim()).filter(Boolean);

export async function completeSetup(
  draft: SetupDraft,
  now: Date = new Date(),
): Promise<void> {
  const provider = configProvider();
  const sourceRepos: SourceRepos = {};
  for (const { id } of SOURCE_REPOS) {
    const url = draft.repos[id].url.trim();
    const path = draft.repos[id].path.trim();
    if (url || path) sourceRepos[id] = { url, path };
  }
  const siteDeployFolders = cleanList(draft.siteDeployFolders);
  const siteHomebrew = siteHomebrewFolders(siteDeployFolders);
  const derived = derivedSources(sourceRepos);
  if (isContainerRuntime() && !provider.stored().homebrew?.path) {
    derived.homebrew = { path: '/data/config/homebrew' };
  }
  await provider.save(
    derived,
    {
      ...provider.effectiveAppSettings(),
      siteDeployFolders,
      homebrewDeployFolders: [
        ...siteHomebrew,
        ...withoutPaths(cleanList(draft.homebrewDeployFolders), siteHomebrew),
      ],
    },
    { sourceRepos, setup: { completedAt: now.toISOString() } },
  );
  resetDataSource();
}
