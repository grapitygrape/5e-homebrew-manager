/** Tests for engine/supersession/duplicates.ts - same-named homebrew. */
import { describe, it, expect } from 'vitest';
import {
  duplicateRows,
  findDuplicates,
  unmappedDuplicates,
} from '../supersession/duplicates.ts';
import type { DuplicateEntity } from '../supersession/duplicates.ts';
import { rowKey } from '../supersession/document.ts';

const e = (
  name: string,
  source: string,
  prop = 'spell',
): DuplicateEntity => ({
  prop,
  source,
  name,
  hash: `${name}_${source}`.toLowerCase().replace(/ /g, '%20'),
});

const official = [
  e('Shield', 'PHB'),
  e('Shield', 'XPHB'),
  e('Fireball', 'XPHB'),
  e('Shield', 'XPHB', 'item'),
];

describe('findDuplicates', () => {
  it('pairs a brew with every official copy of its name, ignoring case', () => {
    const [d, ...rest] = findDuplicates(official, [e('shield', 'STDS')]);
    expect(rest).toEqual([]);
    expect(d.replacement.source).toBe('STDS');
    expect(d.originals.map((o) => o.source)).toEqual(['PHB', 'XPHB']);
  });

  it('matches within a prop only', () => {
    const [d] = findDuplicates(official, [e('Shield', 'Brew', 'item')]);
    expect(d.originals.map((o) => `${o.prop}|${o.source}`)).toEqual([
      'item|XPHB',
    ]);
  });

  it('ignores brews with no official namesake', () => {
    expect(findDuplicates(official, [e('Bolt', 'Brew')])).toEqual([]);
  });
});

describe('unmappedDuplicates', () => {
  it('drops originals already mapped, and duplicates left with none', () => {
    const dupes = findDuplicates(official, [
      e('Shield', 'STDS'),
      e('Fireball', 'STDS'),
    ]);
    const shieldPhb = { page: 'spells.html', hash: 'shield_phb' };
    const fireball = { page: 'spells.html', hash: 'fireball_xphb' };
    const left = unmappedDuplicates(
      dupes,
      new Set([rowKey(shieldPhb), rowKey(fireball)]),
    );
    expect(left).toHaveLength(1);
    expect(left[0].replacement.name).toBe('Shield');
    expect(left[0].originals.map((o) => o.source)).toEqual(['XPHB']);
  });
});

describe('duplicateRows', () => {
  it('maps each official copy to the brew', () => {
    const [d] = findDuplicates(official, [e('Shield', 'STDS')]);
    const rows = duplicateRows(d);
    expect(rows.map((r) => `${r.page}|${r.hash}`)).toEqual([
      'spells.html|shield_phb',
      'spells.html|shield_xphb',
    ]);
    expect(rows[0].replacedBy).toEqual([
      { page: 'spells.html', prop: 'spell', uid: 'Shield|STDS' },
    ]);
  });
});
