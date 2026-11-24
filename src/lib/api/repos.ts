import { backendCall, getJson, postJson } from './transport';

export interface RepoLockEntry {
  locked: boolean;
  pinnedRef: string | null;
  pinnedCommit: string | null;
  follow5ePackageJson: boolean;
  /** 5e-homebrew only: Prepare checks it out at its last commit before 5e's. */
  follow5eDate: boolean;
  note: string;
}

export interface TagInfo {
  name: string;
  /** Unix seconds: the tagger date for annotated tags, else the commit date. */
  timestamp: number;
}

export interface RepoStatus {
  id: string;
  label: string;
  path: string;
  exists: boolean;
  branch: string;
  commit: string;
  fullCommit: string;
  commitDate: string;
  commitTimestamp: number;
  commitSubject: string;
  exactTag: string | null;
  nearestTag: string | null;
  versionTag: TagInfo | null;
  packageVersion: string | null;
  dirtyFiles: string[];
  aheadCount: number;
  behindCount: number;
  recentTags: TagInfo[];
  lock: RepoLockEntry;
  atPinnedCommit: boolean;
}

export interface SchemaSyncReport {
  siteVersion: string | null;
  expectedUtilsVersion: string | null;
  actualUtilsVersion: string | null;
  status: 'synced' | 'ahead' | 'behind' | 'unknown';
  message: string;
  homebrewCommitsAfter5e: number;
}

export interface ReposOverview {
  webRoot: string;
  siteDeployFolders: string[];
  configPath: string;
  repos: RepoStatus[];
  schemaSync: SchemaSyncReport;
}

export interface UpstreamRepoDelta {
  id: string;
  label: string;
  currentVersion: string | null;
  targetVersion: string | null;
  targetRef: string;
  targetDescribe: string | null;
  behindCommits: number;
}

export interface UpstreamIssue {
  category: 'patch' | 'copy' | 'diff' | 'script';
  module: string;
  enabled: boolean;
  message: string;
}

export interface UpstreamCheckReport {
  checkedAt: number;
  fetched: boolean;
  upToDate: boolean;
  ready: boolean;
  site: UpstreamRepoDelta;
  utils: UpstreamRepoDelta | null;
  wantedUtils: string | null;
  patchesChecked: number;
  diffsChecked: number;
  issues: UpstreamIssue[];
  warnings: string[];
}

export const getReposOverview = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('get_repos_overview', undefined, () =>
    getJson<ReposOverview>('/api/repos/overview'),
  );

export const fetchAllRepos = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('fetch_all_repos', undefined, () =>
    postJson<ReposOverview>('/api/repos/fetch', {}),
  );

export const checkUpstreamUpdates = (
  fetch = true,
): Promise<UpstreamCheckReport> =>
  backendCall<UpstreamCheckReport>('check_upstream_updates', { fetch }, () =>
    postJson<UpstreamCheckReport>('/api/repos/upstream', { fetch }),
  );

export const setRepoLock = (opts: {
  repoId: string;
  locked: boolean;
  pinCurrent: boolean;
  follow5ePackageJson?: boolean;
  follow5eDate?: boolean;
  note?: string;
}): Promise<ReposOverview> =>
  backendCall<ReposOverview>('set_repo_lock', opts, () =>
    postJson<ReposOverview>('/api/repos/lock', opts),
  );

export const lockAllAtCurrent = (note?: string): Promise<ReposOverview> =>
  backendCall<ReposOverview>(
    'lock_all_at_current',
    { note: note ?? null },
    () =>
      postJson<ReposOverview>('/api/repos/lock-all', { note: note ?? null }),
  );

export const unlockAllRepos = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('unlock_all_repos', undefined, () =>
    postJson<ReposOverview>('/api/repos/unlock-all', {}),
  );

export const checkoutRepoRef = (opts: {
  repoId: string;
  targetRef: string;
  lockAfter: boolean;
}): Promise<ReposOverview> =>
  backendCall<ReposOverview>('checkout_repo_ref', opts, () =>
    postJson<ReposOverview>('/api/repos/checkout', opts),
  );

export const syncUtilsTo5e = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('sync_utils_to_5e', undefined, () =>
    postJson<ReposOverview>('/api/repos/sync-utils', {}),
  );

export const syncHomebrewTo5eDate = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('sync_homebrew_to_5e_date', undefined, () =>
    postJson<ReposOverview>('/api/repos/sync-homebrew', {}),
  );

/** Pin every repo at the commits the last Publish recorded. */
export const rollBackToPublished = (): Promise<ReposOverview> =>
  backendCall<ReposOverview>('roll_back_to_published', undefined, () =>
    postJson<ReposOverview>('/api/repos/rollback', {}),
  );
