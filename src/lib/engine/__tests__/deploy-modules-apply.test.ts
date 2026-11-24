/** Tests for engine/deploy-modules/apply.ts against the fixtures pipeline.rs also checks. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPatches,
  moduleValues,
  type Patch,
  type Values,
} from '../deploy-modules/apply.ts';

interface Fixture {
  name: string;
  target: string;
  values: Values;
  inserts: Record<string, string>;
  patches: Patch[];
  input: string;
  expected: string;
  status: 'applied' | 'skipped' | 'error';
}

const dir = path.join(import.meta.dirname, '..', 'deploy-modules', 'fixtures');
const fixtures: Fixture[] = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

describe('applyPatches matches the shared fixtures', () => {
  it('has fixtures to check', () => {
    expect(fixtures.length).toBeGreaterThan(10);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))('%s', (_, f) => {
    const out = applyPatches(
      f.input,
      f.target,
      f.patches,
      f.values,
      (n) => f.inserts[n],
    );
    expect(out.text).toBe(f.expected);
    expect(out.status).toBe(f.status);
  });

  it('names the target and note of a required miss', () => {
    const out = applyPatches(
      'abc',
      'js/a.js',
      [{ note: 'Needed', find: 'zzz', replace: 'y' }],
      {},
      () => '',
    );
    expect(out.details).toContain(
      'Required patch failed to match: js/a.js — Needed',
    );
  });
});

describe('moduleValues', () => {
  const def = {
    defaultEnabled: true,
    options: [
      { id: 'on', kind: 'toggle', default: false },
      { id: 'label', kind: 'text', default: 'Ancestries' },
      { id: 'globs', kind: 'list', default: ['a'] },
    ],
  };

  it('uses saved values of the right shape and defaults otherwise', () => {
    const got = moduleValues(def, {
      enabled: false,
      options: { on: true, label: 'Bad "quote"', globs: 'not a list' },
    });
    expect(got).toEqual({
      enabled: false,
      values: { on: true, label: 'Ancestries', globs: ['a'] },
    });
  });

  it('falls back to defaultEnabled with nothing saved', () => {
    expect(moduleValues(def, undefined).enabled).toBe(true);
  });
});
