/**
 * state/deploy-run.svelte.ts - the Deploy Site run in progress, kept outside
 * the page so leaving it doesn't lose the run.
 *
 * WHY
 *   A prepare or publish takes minutes. The log, the step ticks and the busy
 *   flag lived in the page, so moving to another view dropped them, and coming
 *   back showed idle buttons over a run that was still going. Here they last
 *   for the life of the window, and the sidebar card (RunCard) reads them so a
 *   run shows from any view.
 *
 * ONE AT A TIME. `busy` holds the label of whatever is running, pipeline or
 * not, and every Deploy action is disabled while it's set.
 */
import {
  advanceProgress,
  failProgress,
  startProgress,
  type DeployProgress,
} from '$lib/services/deploy-progress';
import {
  onPipelineEvent,
  runPipeline,
  type PipelineAction,
  type PipelineEvent,
  type PipelineSummary,
} from '$lib/tauri-bridge';
import type { BannerState } from '$lib/ui/Banner.svelte';
import { errorText } from '$lib/util';

/** How the last run ended, for the sidebar card until it's dismissed. */
export interface RunOutcome extends BannerState {
  label: string;
}

export const deployRun = $state({
  busy: null as string | null,
  logs: [] as PipelineEvent[],
  prepareProgress: null as DeployProgress | null,
  publishProgress: null as DeployProgress | null,
  /** The last pipeline run's result line on the Deploy page. */
  banner: null as BannerState | null,
  outcome: null as RunOutcome | null,
  /** Id of the last run to finish, so a page that didn't start it reloads. */
  finishedId: 0,
});

let nextId = 0;
let listening: Promise<unknown> | null = null;

// Subscribed once for the window, so events keep landing while the page is closed.
function listen(): Promise<unknown> {
  listening ??= onPipelineEvent((ev) => {
    deployRun.logs.push(ev);
    if (deployRun.prepareProgress)
      deployRun.prepareProgress = advanceProgress(deployRun.prepareProgress, ev);
    if (deployRun.publishProgress)
      deployRun.publishProgress = advanceProgress(deployRun.publishProgress, ev);
  }).catch((err) => {
    listening = null;
    throw err;
  });
  return listening;
}

/**
 * One pipeline run. `onStart` gets the run's id before it starts, so the
 * caller can tell its own runs from ones started elsewhere.
 */
export async function startPipelineRun(opts: {
  action: PipelineAction;
  label: string;
  dryRun?: boolean;
  /** Continue the output of the run before it. */
  keepLog?: boolean;
  prepareSteps: string[];
  publishSteps: string[];
  onStart?: (id: number) => void;
}): Promise<PipelineSummary | null> {
  const { action, label, dryRun = false } = opts;
  const id = ++nextId;
  opts.onStart?.(id);
  deployRun.busy = label;
  deployRun.banner = null;
  deployRun.outcome = null;
  if (!opts.keepLog) deployRun.logs = [];
  const prepares = action === 'prepare' || action === 'full';
  const publishes = action === 'publish' || action === 'full';
  if (prepares) deployRun.prepareProgress = startProgress(opts.prepareSteps);
  if (publishes) deployRun.publishProgress = startProgress(opts.publishSteps);

  let summary: PipelineSummary | null = null;
  try {
    await listen();
    summary = await runPipeline(action, dryRun);
    const skipped = summary.patchesSkipped.length;
    const parts = [
      `${label}: ${summary.ok ? 'finished' : 'failed'}`,
      summary.patchesApplied ? `${summary.patchesApplied} patches applied` : '',
      skipped ? `${skipped} skipped` : '',
      summary.warnings.length ? `${summary.warnings.length} warnings` : '',
    ].filter(Boolean);
    const tone = !summary.ok ? 'error' : summary.warnings.length ? 'warn' : 'ok';
    deployRun.banner = {
      tone,
      text: `${parts.join(' · ')}${dryRun ? ' (dry run - nothing written)' : ''}.${
        (action === 'local' || action === 'prepare') && !dryRun && summary.ok
          ? ' Not published yet.'
          : ''
      }`,
    };
    deployRun.outcome = {
      label,
      tone,
      text: parts.slice(1).join(' · ') || (dryRun ? 'Dry run' : ''),
    };
  } catch (err) {
    const text = errorText(err);
    deployRun.banner = { tone: 'error', text: `${label}: ${text}` };
    deployRun.outcome = { label, tone: 'error', text };
    if (deployRun.prepareProgress && prepares)
      deployRun.prepareProgress = failProgress(deployRun.prepareProgress);
    if (deployRun.publishProgress && publishes)
      deployRun.publishProgress = failProgress(deployRun.publishProgress);
  } finally {
    deployRun.busy = null;
    deployRun.finishedId = id;
  }
  return summary;
}

export function dismissOutcome() {
  deployRun.outcome = null;
}
