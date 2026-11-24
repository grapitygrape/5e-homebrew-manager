/** Tests for engine/copy.ts — `_copy` resolution, `_mod` ops, safe arithmetic. */
import { describe, it, expect } from 'vitest';
import { resolveCopy, getEntityKey, safeArithmetic } from '../merge/copy.ts';
import type { Entity } from '../types.ts';

describe('getEntityKey', () => {
  it('keys by lowercased name + source', () => {
    expect(getEntityKey({ name: 'Long Sword', source: 'PHB' }, 'item')).toBe(
      'long sword__phb',
    );
  });
  it('includes class context for subclassFeature', () => {
    expect(
      getEntityKey(
        {
          name: 'F',
          source: 'B',
          className: 'Fighter',
          classSource: 'PHB',
          level: 3,
          subclassShortName: 'X',
          subclassSource: 'B',
        },
        'subclassFeature',
      ),
    ).toBe('f__b__fighter__phb__3__x__b');
  });
});

describe('resolveCopy', () => {
  const sword: Entity = {
    name: 'Sword',
    source: 'PHB',
    page: 10,
    value: 1000,
    entries: ['A sword.'],
  };
  const flame: Entity = {
    name: 'Flame Sword',
    valueExpression: '[[baseItem.value]] * 2',
    _copy: {
      name: 'Sword',
      source: 'PHB',
      _mod: { entries: { mode: 'appendArr', items: 'It is on fire.' } },
    },
  };
  const map = { [getEntityKey(sword, 'item')]: sword };

  it('merges parent, applies mods, evaluates valueExpression safely', () => {
    const out = resolveCopy(flame, map, 'item');
    expect(out.name).toBe('Flame Sword');
    expect(out.source).toBe('PHB'); // inherited
    expect(out.value).toBe(2000); // 1000 * 2, no eval
    expect(out.entries).toEqual(['A sword.', 'It is on fire.']);
    expect(out._isCopy).toBe(true);
    expect(out._copy).toBeUndefined();
    expect(out.valueExpression).toBeUndefined();
  });

  it('drops preserve-only base fields (page) unless preserved', () => {
    expect(resolveCopy(flame, map, 'item').page).toBeUndefined();
    const preserved: Entity = {
      name: 'P',
      _copy: { name: 'Sword', source: 'PHB', _preserve: { page: true } },
    };
    expect(resolveCopy(preserved, map, 'item').page).toBe(10);
  });

  it('supports remove and replaceTxt mods', () => {
    const child: Entity = {
      name: 'C',
      _copy: {
        name: 'Sword',
        source: 'PHB',
        _mod: {
          value: 'remove',
          entries: { mode: 'replaceTxt', replace: 'sword', with: 'blade' },
        },
      },
    };
    const out = resolveCopy(child, map, 'item');
    expect(out.value).toBeUndefined();
    expect(out.entries).toEqual(['A blade.']);
  });

  it('returns entity unchanged when parent missing', () => {
    const orphan: Entity = { name: 'O', _copy: { name: 'Nope', source: 'X' } };
    const out = resolveCopy(orphan, {}, 'item');
    expect(out._copy).toBeUndefined();
    expect(out.name).toBe('O');
  });
});

describe('safeArithmetic', () => {
  it('evaluates precedence and parentheses', () => {
    expect(safeArithmetic('2 + 3 * 4')).toBe(14);
    expect(safeArithmetic('(2 + 3) * 4')).toBe(20);
    expect(safeArithmetic('10 / 4')).toBe(2.5);
    expect(safeArithmetic('-5 + 2')).toBe(-3);
  });
  it('rejects anything that is not pure arithmetic', () => {
    expect(safeArithmetic('value * 2')).toBeNull();
    expect(safeArithmetic('2 +')).toBeNull();
    expect(safeArithmetic('process.exit(1)')).toBeNull();
    expect(safeArithmetic('')).toBeNull();
  });
});
