/** Tests for engine/shop-book.ts — resolved shop lists → a 5etools homebrew book. */
import { describe, it, expect } from 'vitest';
import {
  buildShopBook,
  validateShopBookOptions,
  groupRowsByType,
  itemCell,
  isTaggable,
  chapterId,
} from '../shop-book.ts';
import type { ShopRow } from '../item-list.ts';

const row = (over: Partial<ShopRow> = {}): ShopRow => ({
  hash: 'rope_xphb',
  quantity: 1,
  found: true,
  name: 'Rope',
  source: 'XPHB',
  kind: 'item',
  type: 'G',
  level: null,
  baseValueCp: 100,
  valueCp: 100,
  weight: 10,
  ...over,
});

describe('itemCell', () => {
  it('emits a {@item} tag for resolved rows', () => {
    expect(itemCell(row())).toBe('{@item Rope|XPHB}');
  });

  it('emits a {@spell} tag for a spell', () => {
    expect(itemCell(row({ name: 'Fireball', kind: 'spell', type: 'spell', level: 3 }))).toBe(
      '{@spell Fireball|XPHB}',
    );
  });

  it('degrades to plain text for unresolved rows rather than a dead link', () => {
    expect(itemCell(row({ found: false, name: 'Gone', source: 'ZZZ' }))).toBe(
      'Gone {@i (unavailable)}',
    );
  });

  it('refuses to tag names that would corrupt the tag grammar', () => {
    expect(isTaggable('Rod of {Power}', 'XDMG')).toBe(false);
    expect(isTaggable('Pipe|Organ', 'XDMG')).toBe(false);
    expect(itemCell(row({ name: 'Pipe|Organ' }))).toBe('Pipe|Organ');
  });
});

describe('groupRowsByType', () => {
  it('groups by type label and sinks unavailable rows to the end', () => {
    const groups = groupRowsByType([
      row({ name: 'Rope', type: 'G' }),
      row({ name: 'Ghost', found: false }),
      row({ name: 'Potion', type: 'P' }),
      row({ name: 'Torch', type: 'G' }),
    ]);
    expect(
      groups.map(([label, rows]) => [label, rows.map((r) => r.name)]),
    ).toEqual([
      ['Gear', ['Rope', 'Torch']],
      ['Potion', ['Potion']],
      ['Unavailable', ['Ghost']],
    ]);
  });
});

describe('chapterId', () => {
  it('slugifies, and falls back to an index when a name has no word characters', () => {
    expect(chapterId('The Silver Hand', 0)).toBe('the-silver-hand');
    expect(chapterId('!!!', 3)).toBe('003');
  });
});

describe('validateShopBookOptions', () => {
  it('rejects sources the brew schema would reject', () => {
    expect(validateShopBookOptions({ source: 'HB' })[0]).toMatch(
      /at least 6 characters/,
    );
    expect(validateShopBookOptions({ source: 'UAShops' })[0]).toMatch(
      /may not start with/,
    );
    expect(validateShopBookOptions({ published: '7 Aug 2026' })[0]).toMatch(
      /YYYY-MM-DD/,
    );
    expect(validateShopBookOptions({ source: 'HBMShops' })).toEqual([]);
  });

  it('buildShopBook throws rather than emitting a brew 5etools will silently drop', () => {
    expect(() => buildShopBook([], { source: 'HB' })).toThrow(
      /at least 6 characters/,
    );
  });
});

describe('buildShopBook', () => {
  const chapter = {
    name: 'The Silver Hand',
    totalCp: 300,
    rows: [
      row({ name: 'Rope', type: 'G' }),
      row({ name: 'Potion of Healing', type: 'P', valueCp: 5000, quantity: 2 }),
    ],
  };

  it('emits one book, one bookData, and a matching id/source triple', () => {
    const doc = buildShopBook([chapter], {
      source: 'HBMShops',
      name: 'Shops of Drakkenheim',
    });
    expect(doc.book).toHaveLength(1);
    expect(doc.bookData).toHaveLength(1);
    expect(doc.book[0].source).toBe('HBMShops');
    expect(doc.book[0].id).toBe('HBMShops');
    expect(doc.bookData[0].id).toBe('HBMShops');
    expect(doc.bookData[0].source).toBe('HBMShops');
    expect(doc._meta.sources[0].json).toBe('HBMShops');
  });

  it('carries every schema-required _meta field', () => {
    const doc = buildShopBook([chapter], { now: 1770000000 });
    expect(doc._meta.dateAdded).toBe(1770000000);
    expect(doc._meta.dateLastModified).toBe(1770000000);
    expect(doc._meta.edition).toBe('one');
    for (const key of ['json', 'abbreviation', 'full', 'version']) {
      expect(doc._meta.sources[0][key]).toBeDefined();
    }
  });

  it('is deterministic without an injected clock, so re-exports diff cleanly', () => {
    expect(JSON.stringify(buildShopBook([chapter], {}))).toBe(
      JSON.stringify(buildShopBook([chapter], {})),
    );
  });

  it('carries every schema-required book field', () => {
    const doc = buildShopBook([chapter], {});
    for (const key of [
      'name',
      'id',
      'source',
      'contents',
      'published',
      'group',
    ]) {
      expect(doc.book[0][key]).toBeDefined();
    }
    expect(doc.book[0].group).toBe('homebrew');
    expect(doc.book[0].published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('makes one section per shop, with contents headers matching the type groups', () => {
    const doc = buildShopBook([chapter], { groupByType: true });
    const section = doc.bookData[0].data[0];
    expect(section.type).toBe('section');
    expect(section.name).toBe('The Silver Hand');
    const contents = doc.book[0].contents as Array<Record<string, unknown>>;
    expect(contents[0].name).toBe('The Silver Hand');
    expect(contents[0].headers).toEqual(['Gear', 'Potion']);
    const names = (section.entries as Array<Record<string, unknown>>)
      .filter((e) => typeof e === 'object' && e.type === 'entries')
      .map((e) => e.name);
    expect(names).toEqual(['Gear', 'Potion']);
  });

  it('builds a single table with tagged item cells when grouping is off', () => {
    const doc = buildShopBook([chapter], {
      groupByType: false,
      includeTotals: false,
    });
    const entries = doc.bookData[0].data[0].entries as Array<
      Record<string, unknown>
    >;
    expect(entries).toHaveLength(1);
    const table = entries[0];
    expect(table.type).toBe('table');
    expect(table.colLabels).toEqual(['Item', 'Cost', 'Weight', 'Qty']);
    expect(table.rows).toEqual([
      ['{@item Rope|XPHB}', '1 gp', '10 lb.', '1'],
      ['{@item Potion of Healing|XPHB}', '50 gp', '10 lb.', '2'],
    ]);
  });

  it('totals value×quantity, not raw value', () => {
    const doc = buildShopBook([chapter], { groupByType: false });
    const entries = doc.bookData[0].data[0].entries as unknown[];
    expect(entries.at(-1)).toBe('{@b Total:} 3 items, 101 gp.');
  });

  it('can drop unresolved rows entirely, and keeps contents headers in sync', () => {
    const withGhost = {
      ...chapter,
      rows: [...chapter.rows, row({ name: 'Ghost', found: false })],
    };
    const kept = buildShopBook([withGhost], { includeUnresolved: true });
    expect(
      (kept.book[0].contents as Array<Record<string, unknown>>)[0].headers,
    ).toEqual(['Gear', 'Potion', 'Unavailable']);

    const dropped = buildShopBook([withGhost], { includeUnresolved: false });
    expect(
      (dropped.book[0].contents as Array<Record<string, unknown>>)[0].headers,
    ).toEqual(['Gear', 'Potion']);
    expect(JSON.stringify(dropped)).not.toContain('Ghost');
  });

  it('stays valid with no shops at all', () => {
    const doc = buildShopBook([], {});
    expect((doc.book[0].contents as unknown[]).length).toBeGreaterThan(0);
    expect(doc.bookData[0].data.length).toBeGreaterThan(0);
  });
});
