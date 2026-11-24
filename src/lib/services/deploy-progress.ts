/**
 * lib/services/deploy-progress.ts — the Deploy page's per-step progress.
 *
 * INTENT
 *   Turns the pipeline's event stream into a state for each line of the step
 *   list. Rust tags every event with its `phase`, so nothing here reads log text.
 */
export type StepState = 'pending' | 'running' | 'done' | 'warn' | 'failed';

export interface DeployProgress {
  steps: Record<string, StepState>;
  current: string | null;
  /** The current step has logged a warning. */
  warned: boolean;
}

export const startProgress = (ids: string[]): DeployProgress => ({
  steps: Object.fromEntries(ids.map((id) => [id, 'pending' as StepState])),
  current: null,
  warned: false,
});

/** Close the running step with `state`; the rest stay as they are. */
function closeCurrent(
  progress: DeployProgress,
  state: StepState,
): DeployProgress {
  if (!progress.current) return progress;
  return {
    steps: { ...progress.steps, [progress.current]: state },
    current: null,
    warned: false,
  };
}

const finished = (progress: DeployProgress): StepState =>
  progress.warned ? 'warn' : 'done';

/** The running step's place in the list, as numbered on the Deploy page. */
export function runningStep(
  progress: DeployProgress,
): { number: number; total: number } | null {
  const ids = Object.keys(progress.steps);
  const index = progress.current ? ids.indexOf(progress.current) : -1;
  return index < 0 ? null : { number: index + 1, total: ids.length };
}

/** A run that ended without the pipeline saying so, such as a rejected call. */
export const failProgress = (progress: DeployProgress): DeployProgress =>
  closeCurrent(progress, 'failed');

export function advanceProgress(
  progress: DeployProgress,
  event: { phase: string; level: string },
): DeployProgress {
  let next = progress;
  // A phase this list doesn't show (a script that's off) leaves it unchanged.
  if (event.phase !== next.current && next.steps[event.phase]) {
    next = closeCurrent(next, finished(next));
    next = {
      ...next,
      steps: { ...next.steps, [event.phase]: 'running' },
      current: event.phase,
    };
  }
  if (event.level === 'warn' && next.current) next = { ...next, warned: true };
  if (event.level === 'error') return closeCurrent(next, 'failed');
  if (event.level === 'done') return closeCurrent(next, finished(next));
  return next;
}
