/** Tests for engine/blocklist/budget.ts — spreading a row budget across sources. */
import { describe, it, expect } from 'vitest';
import { allocateRowBudget } from '../blocklist/budget.ts';

const groups = [
  { key: 'PHB', size: 300 },
  { key: 'MM', size: 500 },
  { key: 'XGE', size: 100 },
];

describe('allocateRowBudget', () => {
  it('gives every group its full size when the budget covers them all', () => {
    const res = allocateRowBudget(groups, 2000);
    expect([...res.taken]).toEqual([
      ['PHB', 300],
      ['MM', 500],
      ['XGE', 100],
    ]);
    expect(res.shown).toBe(900);
    expect(res.total).toBe(900);
    expect(res.truncated).toBe(false);
  });

  it('fills groups in order and cuts the one that straddles the limit', () => {
    const res = allocateRowBudget(groups, 400);
    expect(res.taken.get('PHB')).toBe(300);
    expect(res.taken.get('MM')).toBe(100); // only 100 of the budget left
    expect(res.taken.get('XGE')).toBe(0);
    expect(res.shown).toBe(400);
    expect(res.truncated).toBe(true);
  });

  it('always reports the full total, not just what fits', () => {
    expect(allocateRowBudget(groups, 10).total).toBe(900);
  });

  it('treats the exact-fit boundary as untruncated', () => {
    const res = allocateRowBudget(groups, 900);
    expect(res.shown).toBe(900);
    expect(res.truncated).toBe(false);
  });

  it('zeroes everything on a zero or negative budget without going negative', () => {
    for (const budget of [0, -50]) {
      const res = allocateRowBudget(groups, budget);
      expect([...res.taken.values()]).toEqual([0, 0, 0]);
      expect(res.shown).toBe(0);
      expect(res.truncated).toBe(true);
    }
  });

  it('skips empty groups without consuming budget or claiming truncation', () => {
    const res = allocateRowBudget(
      [
        { key: 'A', size: 0 },
        { key: 'B', size: 5 },
      ],
      5,
    );
    expect(res.taken.get('A')).toBe(0);
    expect(res.taken.get('B')).toBe(5);
    expect(res.truncated).toBe(false);
  });

  it('handles an empty list', () => {
    const res = allocateRowBudget([], 2000);
    expect(res.shown).toBe(0);
    expect(res.total).toBe(0);
    expect(res.truncated).toBe(false);
  });
});
