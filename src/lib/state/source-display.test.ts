/**
 * The source-display store's contract: asks made in one tick go out as one
 * request, nothing is asked twice, and an id nothing declares is kept as null.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const DISPLAYS: Record<
  string,
  { json: string; abbreviation: string; color: string }
> = {
  xphb: { json: 'XPHB', abbreviation: "PHB'24", color: '#d98d2a' },
  spellsthatdontsuck: {
    json: 'SpellsThatDontSuck',
    abbreviation: 'SDS',
    color: '',
  },
};
const resolveSources = vi.fn(async (ids: string[]) =>
  Object.fromEntries(ids.map((id) => [id, DISPLAYS[id] ?? null])),
);
vi.mock('$lib/api', () => ({ resolveSources }));

const { sourceDisplay, resetSourceDisplay } =
  await import('./source-display.svelte.ts');

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetSourceDisplay();
  resolveSources.mockClear();
});

describe('sourceDisplay', () => {
  it('batches one tick of asks into a single request', async () => {
    expect(sourceDisplay('XPHB')).toBeUndefined();
    sourceDisplay('SpellsThatDontSuck');
    sourceDisplay('xphb');
    await settle();
    expect(resolveSources).toHaveBeenCalledTimes(1);
    expect(resolveSources.mock.calls[0][0].sort()).toEqual([
      'spellsthatdontsuck',
      'xphb',
    ]);
    expect(sourceDisplay('XPHB')?.abbreviation).toBe("PHB'24");
    expect(sourceDisplay('SpellsThatDontSuck')?.abbreviation).toBe('SDS');
  });

  it('keeps an unknown id as null and does not ask again', async () => {
    sourceDisplay('Nowhere');
    await settle();
    expect(sourceDisplay('Nowhere')).toBeNull();
    await settle();
    expect(resolveSources).toHaveBeenCalledTimes(1);
  });

  it('falls back to null for every id when the lookup fails', async () => {
    resolveSources.mockRejectedValueOnce(new Error('offline'));
    sourceDisplay('XPHB');
    await settle();
    expect(sourceDisplay('XPHB')).toBeNull();
  });
});
