import { describe, expect, it } from 'vitest';
import {
  advanceProgress,
  failProgress,
  runningStep,
  startProgress,
  type DeployProgress,
} from '../deploy-progress';

const replay = (
  start: DeployProgress,
  events: [phase: string, level: string][],
): DeployProgress =>
  events.reduce(
    (progress, [phase, level]) => advanceProgress(progress, { phase, level }),
    start,
  );

describe('deploy progress', () => {
  const start = startProgress(['repos', 'copy', 'scripts']);

  it('starts with every step waiting', () => {
    expect(start.steps).toEqual({
      repos: 'pending',
      copy: 'pending',
      scripts: 'pending',
    });
  });

  it('runs one step at a time and finishes the last on done', () => {
    const running = replay(start, [
      ['repos', 'step'],
      ['repos', 'info'],
      ['repos', 'step'],
      ['copy', 'step'],
    ]);
    expect(running.steps).toEqual({
      repos: 'done',
      copy: 'running',
      scripts: 'pending',
    });

    const finished = replay(running, [
      ['scripts', 'step'],
      ['scripts', 'done'],
    ]);
    expect(finished.steps).toEqual({
      repos: 'done',
      copy: 'done',
      scripts: 'done',
    });
  });

  it('marks only the step that warned', () => {
    const { steps } = replay(start, [
      ['repos', 'step'],
      ['repos', 'warn'],
      ['copy', 'step'],
      ['copy', 'done'],
    ]);
    expect(steps.repos).toBe('warn');
    expect(steps.copy).toBe('done');
  });

  it('fails the running step and leaves later ones waiting', () => {
    const { steps } = replay(start, [
      ['repos', 'step'],
      ['copy', 'step'],
      ['copy', 'error'],
    ]);
    expect(steps).toEqual({
      repos: 'done',
      copy: 'failed',
      scripts: 'pending',
    });
  });

  it('fails the running step when the run dies without an event', () => {
    const running = replay(start, [['repos', 'step']]);
    expect(failProgress(running).steps.repos).toBe('failed');
  });

  it('ignores events from a phase the list does not show', () => {
    const withoutScripts = startProgress(['repos', 'copy']);
    const { steps, current } = replay(withoutScripts, [
      ['copy', 'step'],
      ['scripts', 'step'],
    ]);
    expect(current).toBe('copy');
    expect(steps.copy).toBe('running');
    expect(steps.scripts).toBeUndefined();
  });

  it('numbers the running step from one, in list order', () => {
    const running = replay(start, [
      ['repos', 'step'],
      ['copy', 'step'],
    ]);
    expect(runningStep(running)).toEqual({ number: 2, total: 3 });
  });

  it('has no running step before the first or after the last', () => {
    expect(runningStep(start)).toBeNull();
    const finished = replay(start, [
      ['scripts', 'step'],
      ['scripts', 'done'],
    ]);
    expect(runningStep(finished)).toBeNull();
  });
});
