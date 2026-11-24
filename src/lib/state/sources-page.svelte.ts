/**
 * lib/state/sources-page.svelte.ts — state and git checkout/lock actions for
 * the Source Data view (`/sources`).
 */
import type { BannerState } from '$lib/ui/Banner.svelte';
import { errorText, formatLocalDate } from '$lib/util';
import { peek, remember, tracked } from '$lib/state/page-cache.svelte.ts';
import {
  checkoutRepoRef,
  checkUpstreamUpdates,
  fetchAllRepos,
  getCapabilities,
  getReposOverview,
  isTauri,
  lockAllAtCurrent,
  setRepoLock,
  syncHomebrewTo5eDate,
  syncUtilsTo5e,
  unlockAllRepos,
  type ReposOverview,
  type RepoStatus,
  type UpstreamCheckReport,
} from '$lib/api';

const OVERVIEW_KEY = 'repos-overview';
const UPSTREAM_KEY = 'upstream-check';

/** Git timestamps are Unix seconds. */
export const formatGitDay = (seconds: number): string =>
  formatLocalDate(seconds * 1000);

export const formatGitDateTime = (seconds: number): string =>
  seconds ? new Date(seconds * 1000).toLocaleString() : '';

export class SourcesPage {
  desktop = $state(false);
  overview = $state<ReposOverview | null>(null);
  upstream = $state<UpstreamCheckReport | null>(null);
  loadError = $state<string | null>(null);
  busy = $state<string | null>(null);
  refreshing = $state(false);
  banner = $state<BannerState | null>(null);

  tagChoice = $state<Record<string, string>>({});
  customRef = $state<Record<string, string>>({});

  // Bumped on every action so an older background re-read drops its stale result.
  private generation = 0;

  readonly schema = $derived(this.overview?.schemaSync ?? null);
  readonly site = $derived(
    this.overview?.repos.find((r) => r.id === '5e') ?? null,
  );
  // Newer homebrew is normal unless it's meant to stay level with the site.
  readonly homebrewAnchored = $derived(
    this.overview?.repos.find((r) => r.id === '5e-homebrew')?.lock
      .follow5eDate ?? false,
  );
  readonly anyLocked = $derived(
    this.overview?.repos.some((repo) => repo.lock.locked) ?? false,
  );

  // Bound inputs need a string per repo; bind:value can't start undefined.
  setOverview = (next: ReposOverview): void => {
    for (const repo of next.repos) {
      this.tagChoice[repo.id] ??= '';
      this.customRef[repo.id] ??= '';
    }
    this.overview = remember(OVERVIEW_KEY, next);
  };

  act = async (
    label: string,
    run: () => Promise<ReposOverview>,
    successText?: string,
  ): Promise<void> => {
    this.busy = label;
    this.banner = null;
    this.generation++;
    try {
      this.setOverview(await run());
      if (successText) this.banner = { tone: 'ok', text: successText };
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `${label} failed: ${errorText(err)}`,
      };
    } finally {
      this.busy = null;
    }
  };

  loadOverview = async (): Promise<void> => {
    this.loadError = null;
    this.refreshing = true;
    const started = this.generation;
    try {
      const next = await tracked(getReposOverview());
      if (this.generation === started) this.setOverview(next);
    } catch (err) {
      if (this.overview) {
        this.banner = {
          tone: 'error',
          text: `Couldn't re-read the repositories: ${errorText(err)}`,
        };
      } else {
        this.loadError = errorText(err);
      }
    } finally {
      this.refreshing = false;
    }
  };

  fetchAll = (): Promise<void> =>
    this.act('Fetch all', fetchAllRepos, 'Fetched all remotes.');

  checkUpstream = async (fetch = true): Promise<void> => {
    this.busy = 'Check for upstream updates';
    this.banner = null;
    try {
      const report = await checkUpstreamUpdates(fetch);
      this.upstream = remember(UPSTREAM_KEY, report);
      // Refresh repo behind-counts after fetching upstream.
      if (fetch) void this.loadOverview();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Upstream check failed: ${errorText(err)}`,
      };
    } finally {
      this.busy = null;
    }
  };

  dismissUpstream = (): void => {
    this.upstream = null;
  };

  lockAll = (): Promise<void> =>
    this.act(
      'Lock all',
      () => lockAllAtCurrent(),
      'All repos locked at their current commit.',
    );

  unlockAll = (): Promise<void> =>
    this.act('Unlock all', unlockAllRepos, 'All repos unlocked.');

  syncUtils = (): Promise<void> =>
    this.act(
      'Match 5etools-utils',
      syncUtilsTo5e,
      '5etools-utils now matches 5e/package.json.',
    );

  syncHomebrew = (): Promise<void> =>
    this.act(
      'Match 5e-homebrew',
      syncHomebrewTo5eDate,
      "5e-homebrew rolled back to 5e's commit date.",
    );

  toggleLock = (repo: RepoStatus): Promise<void> => {
    const locking = !repo.lock.locked;
    return this.act(
      locking ? `Lock ${repo.label}` : `Unlock ${repo.label}`,
      () => setRepoLock({ repoId: repo.id, locked: locking, pinCurrent: true }),
    );
  };

  setFollow = (repo: RepoStatus, follow: boolean): Promise<void> =>
    // pinCurrent: false keeps any existing pin untouched.
    this.act(`Update ${repo.label}`, () =>
      setRepoLock({
        repoId: repo.id,
        locked: repo.lock.locked,
        pinCurrent: false,
        follow5ePackageJson: follow,
      }),
    );

  setAnchor = (repo: RepoStatus, anchor: boolean): Promise<void> =>
    this.act(`Update ${repo.label}`, () =>
      setRepoLock({
        repoId: repo.id,
        locked: repo.lock.locked,
        pinCurrent: false,
        follow5eDate: anchor,
      }),
    );

  targetRefFor = (repo: RepoStatus): string =>
    (this.customRef[repo.id] ?? '').trim() || (this.tagChoice[repo.id] ?? '');

  // Back to the pinned commit, leaving the lock (and its pinned ref) as is.
  rollBack = (repo: RepoStatus): Promise<void> | void => {
    const pin = repo.lock.pinnedCommit;
    if (!pin) return;
    return this.act(
      `Roll back ${repo.label}`,
      () =>
        checkoutRepoRef({ repoId: repo.id, targetRef: pin, lockAfter: false }),
      `${repo.label} is back at its locked commit ${pin}.`,
    );
  };

  checkout = async (repo: RepoStatus): Promise<void> => {
    const targetRef = this.targetRefFor(repo);
    if (!targetRef) return;
    await this.act(
      `Checkout ${repo.label}`,
      () => checkoutRepoRef({ repoId: repo.id, targetRef, lockAfter: true }),
      `${repo.label} is now at ${targetRef} and locked.`,
    );
    // Keep a typed ref around if the checkout failed, so it can be fixed.
    if (this.banner?.tone === 'ok') this.customRef[repo.id] = '';
  };

  #init(): void {
    const remembered = peek<ReposOverview>(OVERVIEW_KEY);
    if (remembered) this.setOverview(remembered);
    const rememberedUpstream = peek<UpstreamCheckReport>(UPSTREAM_KEY);
    if (rememberedUpstream) this.upstream = rememberedUpstream;
    void this.loadOverview();
  }

  mount = (): void => {
    this.desktop = isTauri();
    if (this.desktop) {
      this.#init();
      return;
    }
    void getCapabilities()
      .then((caps) => {
        if (caps.repos) {
          this.desktop = true;
          this.#init();
        }
      })
      .catch(() => null);
  };
}
