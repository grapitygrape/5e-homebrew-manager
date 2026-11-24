/**
 * source-browser.ts - SourceBrowser's pure logic (columns, sorting, search
 * matching, category options) - and SourceRow rendered server-side, so a
 * source row's cells are pinned to the same order as the header's.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import SourceRow from './source-browser/SourceRow.svelte';
import {
  categoryOptions,
  columnLayout,
  nextSort,
  searchNote,
  sortSources,
  sourceMatches,
  DEFAULT_COLUMNS,
  type SourceSummary,
} from './source-browser.ts';

const source = (
  abbr: string,
  over: Partial<SourceSummary> = {},
): SourceSummary => ({
  source: abbr,
  full: `${abbr} Book`,
  isHomebrew: false,
  isPartnered: false,
  isDependency: false,
  total: 0,
  types: [],
  dateAdded: null,
  dateKind: null,
  ...over,
});

const order = (list: SourceSummary[]) => list.map((s) => s.source);

describe('columnLayout', () => {
  it('keeps actions only when there is a snippet to draw in it', () => {
    const cols = ['abbr', 'name', 'count', 'actions'] as const;
    expect(columnLayout(cols, false).drawn).toEqual(['abbr', 'name', 'count']);
    expect(columnLayout(cols, true).hasActions).toBe(true);
  });

  it('puts the expand-all chevron in the first expander column', () => {
    expect(columnLayout(DEFAULT_COLUMNS, false).chevHost).toBe('abbr');
    expect(columnLayout(['name', 'count'], false).chevHost).toBe('name');
    expect(columnLayout(['count'], false).chevHost).toBeNull();
  });

  it('gives type rows the count and every column after it', () => {
    expect(columnLayout(DEFAULT_COLUMNS, false).typeTrailing).toEqual([
      'count',
    ]);
    expect(
      columnLayout(['abbr', 'name', 'count', 'added', 'actions'], true)
        .typeTrailing,
    ).toEqual(['count', 'added', 'actions']);
    expect(columnLayout(['abbr', 'name'], false).typeTrailing).toEqual([]);
  });
});

describe('sorting', () => {
  it('flips a column, and starts a new one in its natural direction', () => {
    expect(nextSort({ key: 'source', dir: 'asc' }, 'source')).toEqual({
      key: 'source',
      dir: 'desc',
    });
    expect(nextSort({ key: 'source', dir: 'asc' }, 'dateAdded')).toEqual({
      key: 'dateAdded',
      dir: 'desc',
    });
  });

  it('sorts by count with ties broken by title', () => {
    const list = [
      source('BBB', { full: 'Beta', total: 5 }),
      source('AAA', { full: 'Zeta', total: 9 }),
      source('CCC', { full: 'Alpha', total: 5 }),
    ];
    expect(order(sortSources(list, { key: 'total', dir: 'desc' }))).toEqual([
      'AAA',
      'CCC',
      'BBB',
    ]);
  });

  it('puts undated sources last whichever way dates sort', () => {
    const list = [
      source('OLD', { dateAdded: 1000 }),
      source('NONE'),
      source('NEW', { dateAdded: 2000 }),
    ];
    expect(order(sortSources(list, { key: 'dateAdded', dir: 'desc' }))).toEqual(
      ['NEW', 'OLD', 'NONE'],
    );
    expect(order(sortSources(list, { key: 'dateAdded', dir: 'asc' }))).toEqual([
      'OLD',
      'NEW',
      'NONE',
    ]);
  });

  it('does not reorder the list it was given', () => {
    const list = [source('B'), source('A')];
    sortSources(list, { key: 'source', dir: 'asc' });
    expect(order(list)).toEqual(['B', 'A']);
  });
});

describe('search and categories', () => {
  it('matches a source by abbreviation or title', () => {
    const s = source('XGE', { full: "Xanathar's Guide" });
    expect(sourceMatches(s, 'xge')).toBe(true);
    expect(sourceMatches(s, 'xanathar')).toBe(true);
    expect(sourceMatches(s, 'tasha')).toBe(false);
  });

  it('tallies each type across sources, sorted by label', () => {
    const opts = categoryOptions([
      source('A', {
        types: [
          { prop: 'spell', label: 'Spells', count: 3 },
          { prop: 'feat', label: 'Feats', count: 1 },
        ],
      }),
      source('B', { types: [{ prop: 'spell', label: 'Spells', count: 2 }] }),
    ]);
    expect(opts).toEqual([
      { prop: 'feat', label: 'Feats', sources: 1, items: 1 },
      { prop: 'spell', label: 'Spells', sources: 2, items: 5 },
    ]);
  });

  it('says when results were capped', () => {
    expect(
      searchNote('fire', { shown: 100, total: 250, truncated: true }),
    ).toMatch(/Showing 100 of 250 matches/);
    expect(searchNote('fire', { shown: 1, total: 1, truncated: false })).toBe(
      '1 match.',
    );
    expect(searchNote('zzz', { shown: 0, total: 0, truncated: false })).toBe(
      'Nothing matches "zzz".',
    );
  });
});

describe('SourceRow', () => {
  const rowCells = (body: string): string[] => {
    const head = body.slice(0, body.indexOf('type-block'));
    const re = /col-abbr|class="expander svelte|col-tags|row-date|row-count/g;
    return [...head.matchAll(re)].map((m) =>
      m[0].replace('class="', '').replace(' svelte', ''),
    );
  };

  function renderRow(columns = DEFAULT_COLUMNS, isOpen = true) {
    const s = source('TST', {
      total: 2,
      isHomebrew: true,
      types: [{ prop: 'spell', label: 'Spells', count: 2 }],
    });
    return render(SourceRow, {
      props: {
        s,
        layout: columnLayout(columns, false),
        hooks: {},
        isOpen,
        active: false,
        types: s.types,
        openTypes: new Set(['TST|spell']),
        itemLoading: new Set<string>(),
        itemsFor: () => ({
          rows: [
            { prop: 'spell', source: 'TST', hash: 'a', name: 'Alpha Bolt' },
            { prop: 'spell', source: 'TST', hash: 'b', name: 'Beta Ray' },
          ],
          total: 2,
        }),
        query: '',
        categoryProp: '',
        onToggleSource: () => {},
        onToggleType: () => {},
      },
    }).body;
  }

  it('draws the source row cells in the column order', () => {
    expect(rowCells(renderRow())).toEqual([
      'col-abbr',
      'expander',
      'col-tags',
      'row-date',
      'row-count',
    ]);
    expect(
      rowCells(renderRow(['abbr', 'name', 'tags', 'count', 'added'])),
    ).toEqual(['col-abbr', 'expander', 'col-tags', 'row-count', 'row-date']);
  });

  it('draws an open type with its entries, and nothing below a closed source', () => {
    const open = renderRow();
    expect(open).toContain('Spells');
    expect(open).toContain('Alpha Bolt');
    expect(open).toContain('Beta Ray');
    const closed = renderRow(DEFAULT_COLUMNS, false);
    expect(closed).not.toContain('type-block');
    expect(closed).not.toContain('Alpha Bolt');
  });
});
