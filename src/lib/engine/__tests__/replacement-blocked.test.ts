/** Tests for components/replacement/blocked.ts — is a mapping dead? */
import { describe, it, expect } from 'vitest';
import {
  buildBlockedIndex,
  isEntityBlocked,
  isUidBlocked,
  isRowBlocked,
  blockedParts,
  describeBlock,
} from '../../components/replacement/blocked.ts';
import type { BlocklistEntry } from '../blocklist/index.ts';
import type { SupersessionRow } from '../supersession/index.ts';

const rule = (
  hash: string,
  category: string,
  source: string,
): BlocklistEntry => ({
  displayName: hash,
  hash,
  category,
  source,
  isAuto: false,
});

const target = (uid: string, prop = 'spell') => ({
  uid,
  prop,
  page: 'spells.html',
});

const row = (over: Partial<SupersessionRow> = {}): SupersessionRow => ({
  displayName: 'Shield',
  source: 'PHB',
  page: 'spells.html',
  hash: 'shield_phb',
  prop: 'spell',
  replacedBy: [target('Deflection|VSS')],
  ...over,
});

describe('isEntityBlocked', () => {
  it('sees an exact rule', () => {
    const ix = buildBlockedIndex([rule('shield_phb', 'spell', 'PHB')]);
    expect(isEntityBlocked(ix, 'shield_phb', 'spell', 'PHB')).toBe(true);
    expect(isEntityBlocked(ix, 'bless_phb', 'spell', 'PHB')).toBe(false);
  });

  it('sees a whole-type and a whole-source rule', () => {
    const byType = buildBlockedIndex([rule('*', 'spell', 'PHB')]);
    expect(isEntityBlocked(byType, 'shield_phb', 'spell', 'PHB')).toBe(true);
    expect(isEntityBlocked(byType, 'goblin_phb', 'monster', 'PHB')).toBe(false);

    const bySource = buildBlockedIndex([rule('*', '*', 'PHB')]);
    expect(isEntityBlocked(bySource, 'goblin_phb', 'monster', 'PHB')).toBe(
      true,
    );
  });

  it('is case-insensitive about the source', () => {
    const ix = buildBlockedIndex([rule('*', '*', 'phb')]);
    expect(isEntityBlocked(ix, 'shield_phb', 'spell', 'PHB')).toBe(true);
  });
});

describe('isUidBlocked', () => {
  it('rebuilds the hash from the uid and the target prop', () => {
    const ix = buildBlockedIndex([rule('deflection_vss', 'spell', 'VSS')]);
    expect(isUidBlocked(ix, target('Deflection|VSS'))).toBe(true);
    expect(isUidBlocked(ix, target('Deflection|PHB'))).toBe(false);
  });

  it('does not match across content types', () => {
    const ix = buildBlockedIndex([rule('deflection_vss', 'item', 'VSS')]);
    expect(isUidBlocked(ix, target('Deflection|VSS', 'spell'))).toBe(false);
  });

  it('matches a whole-source rule', () => {
    const ix = buildBlockedIndex([rule('*', '*', 'VSS')]);
    expect(isUidBlocked(ix, target('Anything At All|VSS'))).toBe(true);
  });

  it('matches a whole-type rule — the target carries its prop', () => {
    const ix = buildBlockedIndex([rule('*', 'spell', 'VSS')]);
    expect(isUidBlocked(ix, target('Deflection|VSS', 'spell'))).toBe(true);
    expect(isUidBlocked(ix, target('Deflection|VSS', 'item'))).toBe(false);
  });

  it('urlifies the name the way 5etools does', () => {
    const ix = buildBlockedIndex([
      rule("artisan's%20kit%20(fine)_vss", 'item', 'VSS'),
    ]);
    expect(isUidBlocked(ix, target("Artisan's Kit (Fine)|VSS", 'item'))).toBe(
      true,
    );
  });

  it('checks only wildcards for a compound-hash prop', () => {
    // A subclass hash carries its class and a state part; it cannot be rebuilt
    // from `Name|Source`, so an exact rule is not claimed to match.
    const exact = buildBlockedIndex([
      rule('bard_phb,state:sub-lore_phb=b1', 'subclass', 'PHB'),
    ]);
    expect(isUidBlocked(exact, target('Lore|PHB', 'subclass'))).toBe(false);
    const wild = buildBlockedIndex([rule('*', 'subclass', 'PHB')]);
    expect(isUidBlocked(wild, target('Lore|PHB', 'subclass'))).toBe(true);
  });

  it('treats a sourceless or unknown-source uid as not blocked', () => {
    const ix = buildBlockedIndex([rule('*', '*', 'VSS')]);
    expect(isUidBlocked(ix, target('Deflection'))).toBe(false);
    expect(isUidBlocked(ix, target('Deflection|?'))).toBe(false);
  });
});

describe('row-level', () => {
  it('is blocked when the original is', () => {
    const ix = buildBlockedIndex([rule('shield_phb', 'spell', 'PHB')]);
    expect(isRowBlocked(ix, row())).toBe(true);
    expect(blockedParts(ix, row())).toEqual({ original: true, targets: [] });
  });

  it('is blocked when a target is', () => {
    const ix = buildBlockedIndex([rule('deflection_vss', 'spell', 'VSS')]);
    expect(blockedParts(ix, row())).toEqual({
      original: false,
      targets: ['Deflection|VSS'],
    });
  });

  it('names only the blocked targets of a split', () => {
    const ix = buildBlockedIndex([rule('deflection_vss', 'spell', 'VSS')]);
    const split = row({
      replacedBy: [target('Deflection|VSS'), target('Ward|VSS')],
    });
    expect(blockedParts(ix, split).targets).toEqual(['Deflection|VSS']);
  });

  it('is clean when neither end is blocked', () => {
    const ix = buildBlockedIndex([rule('fireball_phb', 'spell', 'PHB')]);
    expect(isRowBlocked(ix, row())).toBe(false);
    expect(describeBlock(ix, row())).toBe('');
  });

  it('explains both ends when both are blocked', () => {
    const ix = buildBlockedIndex([
      rule('shield_phb', 'spell', 'PHB'),
      rule('deflection_vss', 'spell', 'VSS'),
    ]);
    const why = describeBlock(ix, row());
    expect(why).toContain('the original');
    expect(why).toContain('Deflection|VSS');
  });
});
