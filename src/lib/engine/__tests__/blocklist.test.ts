/** Tests for engine/blocklist.ts — lookup building + wildcard match patterns. */
import { describe, it, expect } from 'vitest';
import { buildBlocklistLookup, isBlocked } from '../merge/blocklist.ts';

describe('blocklist', () => {
  it('matches an exact name/category/source rule', () => {
    const lookup = buildBlocklistLookup({
      blocklist: [{ hash: 'fireball', category: 'spell', source: 'phb' }],
    });
    expect(
      isBlocked({ name: 'Fireball', source: 'PHB' }, 'spell', lookup),
    ).toBe(true);
    expect(
      isBlocked({ name: 'Fireball', source: 'XGE' }, 'spell', lookup),
    ).toBe(false);
  });

  it('honours wildcards (block a whole source)', () => {
    const lookup = buildBlocklistLookup({
      blocklist: [{ hash: '*', category: 'spell', source: 'phb' }],
    });
    expect(
      isBlocked({ name: 'Anything', source: 'PHB' }, 'spell', lookup),
    ).toBe(true);
  });

  it('encodes parentheses/apostrophes in the name hash like 5etools', () => {
    const lookup = buildBlocklistLookup({
      blocklist: [
        { hash: 'acid%20%28vial%29', category: 'item', source: 'phb' },
      ],
    });
    expect(
      isBlocked({ name: 'Acid (Vial)', source: 'PHB' }, 'item', lookup),
    ).toBe(true);
  });

  it('treats entities with no name/source as blocked', () => {
    expect(isBlocked({ name: 'X' }, 'item', {})).toBe(true);
    expect(isBlocked(null, 'item', {})).toBe(true);
  });
});
