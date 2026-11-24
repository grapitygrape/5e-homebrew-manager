/**
 * lib/state/deploy-page.svelte.ts - the Deploy Site view's state and actions:
 * what it reads (repos, customizations, images, the last run, deploy scripts,
 * the release review, the local preview), the pipeline runs it starts, roll
 * back, guide-list regeneration, and the deploy-script draft.
 *
 * The run itself, its log and step ticks live in state/deploy-run so they
 * outlast the page; this class reads them. One instance per visit to the page.
 */
import { tick } from 'svelte';
import type { BannerState } from '$lib/ui/Banner.svelte';
import { deployRun, startPipelineRun } from '$lib/state/deploy-run.svelte.ts';
import { errorText } from '$lib/util';
import { canAutoPublish } from '$lib/services/release-checks';
import {
  regenerateGuideLists,
  reviewRelease,
  type ReleaseReview,
} from '$lib/api/release';
import {
  isTauri,
  getCapabilities,
  getReposOverview,
  getLocalServerStatus,
  listDeployModules,
  listDeployImages,
  getLastDeployRun,
  listDeployScripts,
  saveDeployScript,
  deleteDeployScript,
  rollBackToPublished,
  type ReposOverview,
  type PipelineAction,
  type PipelineSummary,
  type DeployModule,
  type DeployImageRepo,
  type LastDeployRun,
  type DeployScript,
  type DeployScriptKind,
} from '$lib/tauri-bridge';

export type ScriptDraft = {
  id: string | null;
  title: string;
  kind: DeployScriptKind;
  content: string;
  enabled: boolean;
};

/** A unix time (seconds) as a short local date and time. */
export const dateOf = (seconds: number): string =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

// The order the pipeline runs them in, matching the lists on the page.
const PREPARE_STEPS = [
  'repos',
  'homebrew',
  'reset',
  'block',
  'index',
  'modules',
  'worker',
  'preview',
];

export class DeployPage {
  desktop = $state(false);
  overview = $state<ReposOverview | null>(null);
  loadError = $state<string | null>(null);
  // The run, its log and step ticks live in deploy-run so they outlast the page.
  busy = $derived(deployRun.busy);
  logs = $derived(deployRun.logs);
  prepareProgress = $derived(deployRun.prepareProgress);
  publishProgress = $derived(deployRun.publishProgress);
  // This page's own messages; the last run's result shows when there's none.
  banner = $state<BannerState | null>(null);
  shownBanner = $derived(this.banner ?? deployRun.banner);
  /** The Output log, scrolled into view when a run starts. Set by RunLog. */
  logEl = $state<HTMLElement | null>(null);
  // Publishing pushes the site out, so those buttons take a second click.
  armed = $state<string | null>(null);

  modules = $state<DeployModule[]>([]);
  images = $state<DeployImageRepo[]>([]);
  lastRun = $state<LastDeployRun | null>(null);

  review = $state<ReleaseReview | null>(null);
  reviewing = $state(false);
  reviewError = $state<string | null>(null);
  previewUrl = $state<string | null>(null);

  scripts = $state<DeployScript[]>([]);
  draft = $state<ScriptDraft | null>(null);
  draftError = $state<string | null>(null);

  enabledScripts = $derived(this.scripts.filter((s) => s.enabled));
  enabledModules = $derived(this.modules.filter((m) => m.enabled));
  deployFolders = $derived(this.overview?.siteDeployFolders.join(', ') ?? '');
  canPublish = $derived(
    !!this.overview?.siteDeployFolders.length || this.enabledScripts.length > 0,
  );

  // Named in the prepare steps so it's clear which repos won't move.
  lockedRepos = $derived(
    (this.overview?.repos ?? [])
      .filter((repo) => repo.lock.locked)
      .map((repo) => {
        const at = repo.lock.pinnedRef ?? repo.lock.pinnedCommit;
        return at ? `${repo.label} (${at})` : repo.label;
      }),
  );
  homebrewAnchored = $derived(
    this.overview?.repos.find((r) => r.id === '5e-homebrew')?.lock
      .follow5eDate ?? false,
  );

  publishSteps = $derived([
    'copy',
    ...(this.enabledScripts.length ? ['scripts'] : []),
  ]);

  // Checks that could break the published site and aren't ok.
  holdingBack = $derived(
    (this.review?.checks ?? []).filter(
      (c) => c.blocking && (c.state === 'warn' || c.state === 'fail'),
    ),
  );
  canRollBack = $derived(
    !!this.review?.unpublished &&
      Object.keys(this.review?.published?.commits ?? {}).length > 0,
  );

  #armTimer: ReturnType<typeof setTimeout> | undefined;
  // Runs this copy of the page doesn't need to reload after: its own, which
  // reload themselves, and any that ended before it opened.
  #ownRuns = new Set<number>([deployRun.finishedId]);

  #loadAll(): void {
    void this.loadOverview();
    void this.loadModules();
    void this.loadImages();
    void this.loadLastRun();
    void this.loadScripts();
    void this.loadReview();
    void this.loadPreview();
  }

  /** Read everything the page shows. Returns the teardown. */
  open = (): (() => void) => {
    this.desktop = isTauri();
    if (this.desktop) {
      this.#loadAll();
    } else {
      void getCapabilities()
        .then((caps) => {
          if (caps.pipeline) {
            this.desktop = true;
            this.#loadAll();
          }
        })
        .catch(() => null);
    }
    return () => clearTimeout(this.#armTimer);
  };

  /** A run started on an earlier visit to this page: reload once it ends. */
  syncFinishedRun = (id: number): void => {
    if (!id || this.#ownRuns.has(id) || !this.desktop) return;
    this.#ownRuns.add(id);
    void this.loadPreview();
    void this.#reloadAfterRun(null, false);
  };

  dismissBanner = (): void => {
    this.banner = deployRun.banner = null;
  };

  // --- loading ------------------------------------------------------------------

  async loadOverview() {
    this.loadError = null;
    try {
      this.overview = await getReposOverview();
    } catch (err) {
      this.loadError = errorText(err);
    }
  }

  async loadModules() {
    try {
      this.modules = await listDeployModules();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't read the customizations: ${errorText(err)}`,
      };
    }
  }

  async loadImages() {
    try {
      this.images = await listDeployImages();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't read the image repos: ${errorText(err)}`,
      };
    }
  }

  async loadLastRun() {
    try {
      this.lastRun = await getLastDeployRun();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't read the last run: ${errorText(err)}`,
      };
    }
  }

  async loadScripts() {
    try {
      this.scripts = await listDeployScripts();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't read deploy scripts: ${errorText(err)}`,
      };
    }
  }

  loadReview = async () => {
    this.reviewing = true;
    this.reviewError = null;
    try {
      this.review = await reviewRelease();
    } catch (err) {
      this.reviewError = errorText(err);
    } finally {
      this.reviewing = false;
    }
  };

  async loadPreview() {
    try {
      const status = await getLocalServerStatus();
      this.previewUrl = status.running ? status.url : null;
    } catch {
      this.previewUrl = null;
    }
  }

  // --- runs -----------------------------------------------------------------------

  /** True once the button has been clicked twice within five seconds. */
  confirmed = (key: string): boolean => {
    clearTimeout(this.#armTimer);
    if (this.armed === key) {
      this.armed = null;
      return true;
    }
    this.armed = key;
    this.#armTimer = setTimeout(() => (this.armed = null), 5000);
    return false;
  };

  /** One pipeline run. `keepLog` continues the output of the run before it. */
  run = async (
    action: PipelineAction,
    label: string,
    dryRun = false,
    keepLog = false,
  ): Promise<PipelineSummary | null> => {
    this.banner = null;
    // Other runs start from further down the page, below the output.
    tick().then(() => this.logEl?.scrollIntoView({ block: 'nearest' }));
    const summary = await startPipelineRun({
      action,
      label,
      dryRun,
      keepLog,
      prepareSteps: PREPARE_STEPS,
      publishSteps: this.publishSteps,
      onStart: (id) => this.#ownRuns.add(id),
    });
    if (summary?.previewUrl) this.previewUrl = summary.previewUrl;
    await this.#reloadAfterRun(action, dryRun);
    return summary;
  };

  // A prepare moves repos and rewrites files; a publish changes what's live.
  async #reloadAfterRun(action: PipelineAction | null, dryRun: boolean) {
    const reviews =
      !dryRun &&
      (action === null ||
        action === 'prepare' ||
        action === 'full' ||
        action === 'publish');
    await Promise.all([this.loadOverview(), this.loadLastRun()]);
    if (reviews) await this.loadReview();
  }

  prepare = async () => {
    await this.run('prepare', 'Prepare');
  };

  /** The routine update: stops after Review when something needs a look. */
  prepareAndPublish = async () => {
    const summary = await this.run('prepare', 'Prepare');
    if (!summary?.ok || !this.review) return;
    if (!canAutoPublish(this.review.checks)) {
      this.banner = {
        tone: 'warn',
        text: 'Prepared, but Review found something that could break the site. Look it over below, then publish.',
      };
      return;
    }
    await this.run('publish', 'Publish', false, true);
  };

  publish = async () => {
    if (!this.confirmed('publish')) return;
    await this.run('publish', 'Publish');
  };

  rollBack = async () => {
    if (!this.confirmed('rollback')) return;
    deployRun.busy = 'Roll back';
    this.banner = null;
    try {
      this.overview = await rollBackToPublished();
    } catch (err) {
      this.banner = { tone: 'error', text: `Roll back: ${errorText(err)}` };
      deployRun.busy = null;
      return;
    }
    deployRun.busy = null;
    await this.run('prepare', 'Prepare the live version');
  };

  regenerateLists = async () => {
    deployRun.busy = 'Regenerate guide lists';
    try {
      const { rewritten, problems } = await regenerateGuideLists();
      this.banner = {
        tone: problems.length ? 'warn' : 'ok',
        text: `Rewrote ${rewritten} guide(s).${
          problems.length
            ? ` ${problems.length} list(s) can't be generated: fix those by hand.`
            : ' Commit the guide changes with the rest of this update.'
        }`,
      };
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't regenerate the guide lists: ${errorText(err)}`,
      };
    } finally {
      deployRun.busy = null;
    }
    await this.loadReview();
  };

  // --- deploy scripts -----------------------------------------------------------

  editScript = (script: DeployScript | null) => {
    this.draftError = null;
    this.draft = script
      ? {
          id: script.id,
          title: script.title,
          kind: script.kind,
          content: script.content,
          enabled: script.enabled,
        }
      : { id: null, title: '', kind: 'powershell', content: '', enabled: true };
  };

  saveDraft = async () => {
    if (!this.draft) return;
    this.draftError = null;
    try {
      await saveDeployScript(this.draft);
      this.draft = null;
      await this.loadScripts();
    } catch (err) {
      this.draftError = errorText(err);
    }
  };

  removeScript = async (script: DeployScript) => {
    if (!this.confirmed(`delete:${script.id}`)) return;
    try {
      await deleteDeployScript(script.id);
      this.draft = null;
      await this.loadScripts();
    } catch (err) {
      this.banner = {
        tone: 'error',
        text: `Couldn't delete ${script.title}: ${errorText(err)}`,
      };
    }
  };
}
