/**
 * Tests for engine/blocklist/unblock.ts — carving one allowance out of a
 * wildcard block by expanding it into its siblings.
 */
import { describe, it, expect } from 'vitest';
import { unblockNode } from '../blocklist/unblock.ts';
import { entryKey } from '../blocklist/entries.ts';
import type { BlocklistEntry } from '../blocklist/entries.ts';

const rule = (
  hash: string,
  category: string,
  source: string,
  isAuto = false,
): BlocklistEntry => ({
  displayName: hash === '*' ? '*' : hash,
  hash,
  category,
  source,
  isAuto,
});

/** Source shape: PHB holds spells, items and monsters. */
const PHB_TYPES = ['spell', 'item', 'monster'];
const SPELLS = [
  { hash: 'fireball', name: 'Fireball' },
  { hash: 'shield', name: 'Shield' },
  { hash: 'wish', name: 'Wish' },
];

const keys = (entries: BlocklistEntry[]) => entries.map(entryKey).sort();
const ctx = { types: PHB_TYPES, siblings: SPELLS };

describe('unblockNode — whole-type target under a blocked source', () => {
  it('replaces the source wildcard with one rule per OTHER type', () => {
    const res = unblockNode(
      [rule('*', '*', 'PHB')],
      { hash: '*', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toEqual(['*__item__phb', '*__monster__phb']);
    expect(res.added).toBe(2);
    expect(res.removed).toBe(1);
  });

  it('leaves rules for other sources completely alone', () => {
    const before = [
      rule('*', '*', 'PHB'),
      rule('*', '*', 'MM'),
      rule('fireball', 'spell', 'XGE'),
    ];
    const res = unblockNode(
      before,
      { hash: '*', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toContain('*__*__mm');
    expect(keys(res.entries)).toContain('fireball__spell__xge');
  });
});

describe('unblockNode — single item under a blocked type', () => {
  it('replaces the type wildcard with one rule per OTHER item', () => {
    const res = unblockNode(
      [rule('*', 'spell', 'PHB')],
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toEqual([
      'shield__spell__phb',
      'wish__spell__phb',
    ]);
    expect(res.added).toBe(2);
  });

  it('carries each sibling’s display name onto its new rule', () => {
    const res = unblockNode(
      [rule('*', 'spell', 'PHB')],
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(res.entries.find((e) => e.hash === 'wish')?.displayName).toBe(
      'Wish',
    );
  });

  it('never leaves a rule for the thing being un-blocked', () => {
    const res = unblockNode(
      [rule('*', 'spell', 'PHB')],
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).not.toContain('fireball__spell__phb');
  });
});

describe('unblockNode — single item under a blocked SOURCE peels both layers', () => {
  const res = unblockNode(
    [rule('*', '*', 'PHB')],
    { hash: 'fireball', category: 'spell', source: 'PHB' },
    ctx,
  );

  it('blocks the other types wholesale and the other spells individually', () => {
    expect(keys(res.entries)).toEqual([
      '*__item__phb',
      '*__monster__phb',
      'shield__spell__phb',
      'wish__spell__phb',
    ]);
  });

  it('reports the full cost of the expansion', () => {
    expect(res.added).toBe(4);
  });
});

describe('unblockNode — safety', () => {
  it('refuses when the covering rule is auto-managed, changing nothing', () => {
    const before = [rule('*', '*', 'PHB', true)];
    const res = unblockNode(
      before,
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(res.refusedAuto).toBe(true);
    expect(res.entries).toEqual(before);
    expect(res.added).toBe(0);
  });

  it('does not duplicate a sibling rule that is already present', () => {
    const before = [rule('*', 'spell', 'PHB'), rule('wish', 'spell', 'PHB')];
    const res = unblockNode(
      before,
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toEqual([
      'shield__spell__phb',
      'wish__spell__phb',
    ]);
    expect(res.added).toBe(1); // only Shield was genuinely new
  });

  it('drops an exact rule on the target as well as the wildcard above it', () => {
    const before = [rule('*', '*', 'PHB'), rule('fireball', 'spell', 'PHB')];
    const res = unblockNode(
      before,
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).not.toContain('fireball__spell__phb');
  });

  it('is a no-op when nothing was blocking the target', () => {
    const res = unblockNode(
      [rule('*', '*', 'MM')],
      { hash: 'fireball', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toEqual(['*__*__mm']);
    expect(res.added).toBe(0);
    expect(res.removed).toBe(0);
  });

  it('matches sources case-insensitively, as the rest of the engine does', () => {
    const res = unblockNode(
      [rule('*', '*', 'phb')],
      { hash: '*', category: 'spell', source: 'PHB' },
      ctx,
    );
    expect(keys(res.entries)).toEqual(['*__item__phb', '*__monster__phb']);
  });
});
