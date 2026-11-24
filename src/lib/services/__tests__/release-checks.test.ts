/** Tests for services/release-checks.ts — Deploy Site's Review judgement. */
import { describe, it, expect } from 'vitest';
import {
  judgeRelease,
  canAutoPublish,
  type ReleaseInput,
} from '../release-checks';
import type { LastPrepare, ModuleCheck } from '$lib/tauri-bridge';

const skip = (id: string, ...details: string[]): ModuleCheck => ({
  id,
  status: 'skipped',
  details,
});

function input(over: Partial<ReleaseInput> = {}): ReleaseInput {
  const prepare: LastPrepare = {
    at: 200,
    ok: true,
    siteVersion: '2.41.0',
    commits: { '5e': 'b' },
    warnings: [],
    blockedSources: [],
    modules: [
      { id: 'shops', status: 'ok', details: [] },
      { id: 'theme', status: 'off', details: [] },
    ],
  };
  return {
    prepare,
    published: {
      at: 100,
      siteVersion: '2.39.0',
      commits: { '5e': 'a' },
      modules: [],
    },
    moduleTitles: { shops: 'Shops' },
    scriptNames: { from: 'a', to: 'b', missing: [] },
    brews: [{ file: 'A.json', error: null }],
    guides: { failing: [] },
    guideLists: { problems: [] },
    collisions: { errors: 0 },
    schemaSync: null,
    ...over,
  };
}

const byId = (checks: ReturnType<typeof judgeRelease>, id: string) =>
  checks.find((c) => c.id === id)!;

describe('judgeRelease', () => {
  it('passes a clean candidate for an automatic publish', () => {
    const checks = judgeRelease(input());
    expect(
      checks.filter((c) => c.state !== 'ok' && c.state !== 'info'),
    ).toEqual([]);
    expect(canAutoPublish(checks)).toBe(true);
  });

  it('treats a skip the live site already had as normal', () => {
    const checks = judgeRelease(
      input({
        prepare: { ...input().prepare, modules: [skip('shops', 'x missing')] },
        published: {
          ...input().published!,
          modules: [skip('shops', 'x missing')],
        },
      }),
    );
    expect(byId(checks, 'modules').state).toBe('ok');
    expect(canAutoPublish(checks)).toBe(true);
  });

  it('leaves skipped-patch warnings to the customizations line', () => {
    // pipeline.rs warns for every allowMissing patch it skips.
    const checks = judgeRelease(
      input({
        prepare: {
          ...input().prepare,
          warnings: ['Skipped patch (no match): js/x.js — note'],
          modules: [skip('shops', 'x missing')],
        },
        published: {
          ...input().published!,
          modules: [skip('shops', 'x missing')],
        },
      }),
    );
    expect(byId(checks, 'prepare').state).toBe('ok');
    expect(canAutoPublish(checks)).toBe(true);
  });

  it('holds back a skip the live site did not have', () => {
    const checks = judgeRelease(
      input({
        prepare: {
          ...input().prepare,
          modules: [skip('shops', 'x missing', 'y missing')],
        },
        published: {
          ...input().published!,
          modules: [skip('shops', 'x missing')],
        },
      }),
    );
    const modules = byId(checks, 'modules');
    expect(modules.state).toBe('warn');
    expect(modules.details).toContain('Shops: y missing');
    expect(canAutoPublish(checks)).toBe(false);
  });

  it('fails a failed Prepare and a brew that does not parse', () => {
    const checks = judgeRelease(
      input({
        prepare: { ...input().prepare, ok: false },
        brews: [{ file: 'Bad.json', error: 'Unexpected token' }],
      }),
    );
    expect(byId(checks, 'prepare').state).toBe('fail');
    expect(byId(checks, 'brews').details).toEqual([
      'Bad.json: Unexpected token',
    ]);
    expect(canAutoPublish(checks)).toBe(false);
  });

  it('leaves guide and collision work off the publish gate', () => {
    const checks = judgeRelease(
      input({
        guides: { failing: ['class-conversion.md'] },
        guideLists: {
          problems: ['adventure-conversion.md: stale "storylines"'],
        },
        collisions: { errors: 2 },
      }),
    );
    expect(byId(checks, 'guides').state).toBe('warn');
    expect(byId(checks, 'guide-lists').state).toBe('warn');
    expect(canAutoPublish(checks)).toBe(true);
  });

  it('holds back when a blocking check could not run', () => {
    const checks = judgeRelease(
      input({ scriptNames: { error: 'git grep failed' } }),
    );
    expect(byId(checks, 'script-names').state).toBe('warn');
    expect(canAutoPublish(checks)).toBe(false);
  });

  it('flags dropped names, and has nothing to compare before a first publish', () => {
    const dropped = judgeRelease(
      input({
        scriptNames: {
          from: 'a',
          to: 'b',
          missing: [{ module: 'shops', names: ['getEntryMediaUrl'] }],
        },
      }),
    );
    expect(byId(dropped, 'script-names').state).toBe('fail');

    const first = judgeRelease(
      input({ scriptNames: { from: null, to: 'b', missing: [] } }),
    );
    expect(byId(first, 'script-names').state).toBe('info');
    expect(canAutoPublish(first)).toBe(true);
  });
});
