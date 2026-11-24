/**
 * SourceBrowser's `columns` prop is an ORDER, not a set. Rendered server-side,
 * because the header is drawn before the corpus fetch and that is the surface
 * under test: the rows walk the same array with the same branch chain.
 *
 * The Blocklist's default order and the picker's order are both pinned here, so
 * a change to one cannot silently move the other.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import SourceBrowser from './SourceBrowser.svelte';
import { DEFAULT_COLUMNS, type ColumnKey } from './source-browser.ts';

/**
 * The header markup only. Both markers are asserted before slicing: a missed
 * `indexOf` returns -1, and `slice(-1, …)` would hand back a plausible-looking
 * fragment of the wrong part of the document while every assertion below still
 * passed.
 */
function headerOf(body: string): string {
  const from = body.indexOf('col-head');
  const to = body.indexOf('Indexing your content');
  expect(from, 'col-head marker missing from rendered body').toBeGreaterThan(
    -1,
  );
  expect(to, 'loading marker missing from rendered body').toBeGreaterThan(from);
  return body.slice(from, to);
}

function renderBrowser(
  columns?: readonly ColumnKey[],
  withActions = false,
): string {
  const props: Record<string, unknown> = {};
  if (columns) props.columns = columns;
  if (withActions) props.itemActions = () => {};
  return render(SourceBrowser, { props }).body;
}

/** The header cells, in the order they appear in the rendered markup. */
function headerCells(
  columns?: readonly ColumnKey[],
  withActions = false,
): string[] {
  const head = headerOf(renderBrowser(columns, withActions));
  const out: string[] = [];
  const re =
    /ch-lead ch-abbr|ch-lead svelte|ch-tags|ch-date|ch-count|ch-actions/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head))) out.push(m[0].replace(' svelte', ''));
  return out;
}

describe('column order', () => {
  it('default (Blocklist) order is unchanged from today', () => {
    expect(DEFAULT_COLUMNS).toEqual(['abbr', 'name', 'tags', 'added', 'count']);
    expect(headerCells()).toEqual([
      'ch-lead ch-abbr',
      'ch-lead',
      'ch-tags',
      'ch-date',
      'ch-count',
    ]);
  });

  it('picker order puts Count before Added and Actions last', () => {
    expect(
      headerCells(['abbr', 'name', 'tags', 'count', 'added', 'actions'], true),
    ).toEqual([
      'ch-lead ch-abbr',
      'ch-lead',
      'ch-tags',
      'ch-count',
      'ch-date',
      'ch-actions',
    ]);
  });

  it('drops the actions column when the snippet is absent', () => {
    expect(headerCells(['abbr', 'name', 'count', 'actions'], false)).toEqual([
      'ch-lead ch-abbr',
      'ch-lead',
      'ch-count',
    ]);
  });

  it('chevron moves into the name column when abbr is not drawn', () => {
    const head = headerOf(renderBrowser(['name', 'count']));
    expect(head).not.toContain('ch-abbr');
    expect(head.indexOf('ch-lead')).toBeLessThan(head.indexOf('chev-all'));
    expect(head.indexOf('chev-all')).toBeLessThan(head.indexOf('Title'));
  });

  it('draws exactly one expand-all chevron', () => {
    const orders: readonly ColumnKey[][] = [
      [...DEFAULT_COLUMNS],
      ['abbr', 'name', 'tags', 'count', 'added', 'actions'],
      ['name', 'abbr'],
    ];
    for (const columns of orders) {
      expect(headerOf(renderBrowser(columns)).split('chev-all')).toHaveLength(
        2,
      );
    }
  });
});

/**
 * The filter row is the same on every page that draws the tree: one search
 * box, one type select, and whatever the caller puts beside them. It used to be
 * two boxes with a caller able to drop the block entirely, and a page that
 * searched the corpus itself then owned a third box above the panel - which
 * silently narrowed the hits it had just handed the tree.
 */
describe('the filter row', () => {
  it('draws one search box and one type select', () => {
    const body = render(SourceBrowser, { props: {} }).body;
    expect(body).toContain('Search sources and entries.');
    expect(body).toContain('Type filter');
    expect(body).toContain('All types');
    // The pair the single box replaced.
    expect(body).not.toContain('Search sources.');
    expect(body).not.toContain('Filter entries in opened types.');
  });

  it('draws exactly one search input', () => {
    const body = render(SourceBrowser, { props: {} }).body;
    // `type="search"` is one per SearchInput; its class name is not - the
    // component puts `search-input` on both its wrapper and its field.
    expect(body.split('type="search"')).toHaveLength(2);
  });
});
