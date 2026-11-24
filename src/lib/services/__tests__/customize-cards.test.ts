import { describe, expect, it } from 'vitest';
import { labelProblem, moduleCards, optionGroups } from '../customize-cards';

describe('customize cards', () => {
  it('puts modules naming a card together where the first one falls', () => {
    const cards = moduleCards([
      { id: 'theme', card: null },
      { id: 'merged', card: 'Items page' },
      { id: 'cache', card: null },
      { id: 'filters', card: 'Items page' },
    ]);
    expect(cards.map((c) => [c.title, c.modules.map((m) => m.id)])).toEqual([
      [null, ['theme']],
      ['Items page', ['merged', 'filters']],
      [null, ['cache']],
    ]);
  });

  it('splits options by menu and leaves ungrouped ones out', () => {
    const groups = optionGroups([
      { id: 'tables', group: 'Rules' },
      { id: 'names', group: 'Player' },
      { id: 'quick', group: 'Rules' },
      { id: 'file', group: null },
    ]);
    expect(groups.map((g) => [g.title, g.options.map((o) => o.id)])).toEqual([
      ['Rules', ['tables', 'quick']],
      ['Player', ['names']],
    ]);
  });

  it('refuses labels that would break the quoted strings they land in', () => {
    expect(labelProblem('Ancestries')).toBeNull();
    expect(labelProblem("Folk's Kin")).toBeNull();
    expect(labelProblem('   ')).not.toBeNull();
    for (const bad of ['a"b', 'a`b', 'a\\b', 'a$b', '<b>', 'a\nb']) {
      expect(labelProblem(bad), bad).not.toBeNull();
    }
  });
});
