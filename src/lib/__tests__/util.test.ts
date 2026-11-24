/** Tests for shared lib/util.ts helpers. */
import { describe, it, expect } from 'vitest';
import { errorText, formatFolderOutcome, mapPool } from '../util.ts';

describe('errorText', () => {
  it('extracts Error.message', () => {
    expect(errorText(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(errorText('plain')).toBe('plain');
    expect(errorText(42)).toBe('42');
  });
});

describe('formatFolderOutcome', () => {
  it('formats a clean single-folder success', () => {
    expect(formatFolderOutcome('Deployed to', 1, [])).toEqual({
      ok: true,
      text: 'Deployed to 1 folder',
    });
  });

  it('pluralizes multiple folders and appends per-folder errors', () => {
    expect(
      formatFolderOutcome('Added to', 2, [
        { label: 'Prod', message: 'locked' },
        { label: 'Stage', file: 'hb.json', message: 'parse error' },
      ]),
    ).toEqual({
      ok: false,
      text: 'Added to 2 folders · Prod: locked · Stage: hb.json — parse error',
    });
  });

  it('uses the fallback when neither counts nor errors are present', () => {
    expect(formatFolderOutcome('Removed from', 0, [], 'Nothing done')).toEqual({
      ok: false,
      text: 'Nothing done',
    });
  });
});

describe('mapPool', () => {
  it('returns [] for an empty list without invoking workers', async () => {
    let called = 0;
    const out = await mapPool([], async () => {
      called++;
      return 1;
    });
    expect(out).toEqual([]);
    expect(called).toBe(0);
  });

  it('preserves input order while enforcing the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const inputs = [40, 5, 30, 10, 25, 1, 15, 2];

    const out = await mapPool(
      inputs,
      async (ms, idx) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, ms));
        active--;
        return `${idx}:${ms}`;
      },
      3,
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(out).toEqual(inputs.map((ms, idx) => `${idx}:${ms}`));
  });
});
