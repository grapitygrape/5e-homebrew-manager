/** Tests for engine/shop-list.ts — the shop file format and adding to it. */
import { describe, it, expect } from 'vitest';
import {
  addShopEntries,
  cleanShopEntry,
  emptyShop,
  isShopFileName,
  normalizeShopListImport,
  parseShopFile,
  shopFileName,
  siteListExport,
} from '../shop-list.ts';

describe('cleanShopEntry', () => {
  it('keeps the hash, a whole count and the snapshot', () => {
    expect(
      cleanShopEntry({ h: 'rope_phb', c: '2', name: ' Rope ', source: 'PHB', value: 100, extra: 1 }),
    ).toEqual({ h: 'rope_phb', c: 2, name: 'Rope', source: 'PHB', value: 100 });
  });

  it('defaults a missing or bad count to 1 and drops entries without a hash', () => {
    expect(cleanShopEntry({ h: 'rope_phb' })).toEqual({ h: 'rope_phb', c: 1 });
    expect(cleanShopEntry({ h: 'rope_phb', c: 0 })?.c).toBe(1);
    expect(cleanShopEntry({ c: 2 })).toBeNull();
    expect(cleanShopEntry('rope_phb')).toBeNull();
  });
});

describe('addShopEntries', () => {
  it('adds to the count of an item already stocked', () => {
    const shop = { ...emptyShop('Goods'), items: [{ h: 'rope_phb', c: 2 }] };
    const out = addShopEntries(shop, [
      { h: 'rope_phb', c: 3, name: 'Rope', source: 'PHB' },
      { h: 'torch_phb', c: 1 },
    ]);
    expect(out.items).toEqual([
      { h: 'rope_phb', c: 5, name: 'Rope', source: 'PHB' },
      { h: 'torch_phb', c: 1 },
    ]);
    expect(out.sources).toEqual(['PHB']);
    // The original is left alone.
    expect(shop.items[0].c).toBe(2);
  });

  it('keeps the same hash with another custom hash id apart', () => {
    const out = addShopEntries(emptyShop('Stable'), [
      { h: 'horse_mm', c: 1 },
      { h: 'horse_mm', c: 1, customHashId: 'scaled:5' },
    ]);
    expect(out.items).toHaveLength(2);
  });
});

describe('normalizeShopListImport', () => {
  it('reads a 5etools Export list file', () => {
    const shop = normalizeShopListImport({
      fileType: 'items-sublist',
      name: 'Trollskull Alley Goods',
      items: [{ h: "thieves'%20tools_xphb", c: '2' }, { nope: true }],
      sources: ['XPHB'],
    });
    expect(shop.name).toBe('Trollskull Alley Goods');
    expect(shop.items).toEqual([{ h: "thieves'%20tools_xphb", c: 2 }]);
  });

  it('unwraps exportedSublist and falls back to the given name', () => {
    const shop = normalizeShopListImport(
      { exportedSublist: { items: [{ h: 'rope_phb' }] } },
      'From file',
    );
    expect(shop.name).toBe('From file');
    expect(shop).not.toHaveProperty('exportedSublist');
  });

  it('refuses other list types and empty lists', () => {
    expect(() =>
      normalizeShopListImport({ fileType: 'spells-sublist', items: [{ h: 'x_phb' }] }),
    ).toThrow(/Wrong list type/);
    expect(() => normalizeShopListImport({ items: [] })).toThrow(/no item entries/);
    expect(() => normalizeShopListImport({})).toThrow(/No "items"/);
  });
});

describe('parseShopFile', () => {
  it('keeps unknown keys and names the shop after the file when unnamed', () => {
    const shop = parseShopFile({ items: [{ h: 'rope_phb' }], keeper: 'Bob' }, 'goods');
    expect(shop).toMatchObject({ fileType: 'items-sublist', name: 'goods', keeper: 'Bob' });
  });
});

describe('shopFileName', () => {
  it('slugs the name and steps past names in use', () => {
    expect(shopFileName('Trollskull Alley Goods')).toBe('trollskull-alley-goods.json');
    expect(shopFileName('Café Ørn')).toBe('cafe-rn.json');
    expect(shopFileName('Goods', ['goods.json', 'Goods-2.json'])).toBe('goods-3.json');
    expect(shopFileName('!!!')).toBe('shop.json');
  });
});

describe('isShopFileName', () => {
  it('takes bare json names only', () => {
    expect(isShopFileName('goods.json')).toBe(true);
    expect(isShopFileName('../goods.json')).toBe(false);
    expect(isShopFileName('a\\goods.json')).toBe(false);
    expect(isShopFileName('goods.json.bak')).toBe(false);
    expect(isShopFileName('.json')).toBe(false);
  });
});

describe('spells and costs in a shop file', () => {
  it('keeps a spell entry’s page, level and offer, and a cost on any entry', () => {
    expect(
      cleanShopEntry({ h: 'fireball_xphb', page: 'spells.html', level: 3, as: 'spell', cost: 150 }),
    ).toEqual({ h: 'fireball_xphb', c: 1, page: 'spells.html', level: 3, as: 'spell', cost: 150 });
    expect(cleanShopEntry({ h: 'rope_phb', cost: 2.5 })).toEqual({ h: 'rope_phb', c: 1, cost: 2.5 });
  });

  it('drops a bad cost, level or offer, and spell fields on an item', () => {
    expect(
      cleanShopEntry({ h: 'fireball_xphb', page: 'spells.html', level: 12, as: 'potion', cost: -1 }),
    ).toEqual({ h: 'fireball_xphb', c: 1, page: 'spells.html' });
    expect(cleanShopEntry({ h: 'rope_phb', page: 'other.html', level: 3, as: 'spell' })).toEqual({
      h: 'rope_phb',
      c: 1,
    });
  });

  it('keeps a spell apart from an item with the same hash, and a re-add keeps the DM’s choices', () => {
    const shop = {
      ...emptyShop('Magic'),
      items: [
        { h: 'light_phb', c: 1, page: 'spells.html', as: 'spell' as const, cost: 10 },
        { h: 'light_phb', c: 1 },
      ],
    };
    const out = addShopEntries(shop, [{ h: 'light_phb', c: 1, page: 'spells.html', level: 0 }]);
    expect(out.items).toEqual([
      { h: 'light_phb', c: 2, page: 'spells.html', as: 'spell', cost: 10, level: 0 },
      { h: 'light_phb', c: 1 },
    ]);
  });

  it('leaves spells out of the file for the site’s Load list', () => {
    const shop = {
      ...emptyShop('Magic'),
      items: [
        { h: 'fireball_xphb', c: 1, page: 'spells.html' },
        { h: 'rope_phb', c: 1, source: 'PHB' },
      ],
    };
    expect(JSON.parse(siteListExport(shop)).items).toEqual([{ h: 'rope_phb', c: 1, source: 'PHB' }]);
  });
});
