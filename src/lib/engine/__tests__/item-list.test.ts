/** Tests for engine/item-list.ts — sublist hashing + resolution. */
import { describe, it, expect } from 'vitest';
import {
  itemHash,
  hashToName,
  buildItemIndex,
  resolveItemList,
  normalizeVariantItem,
  classifyUnresolved,
} from '../item-list.ts';
import { buildBlocklistLookup } from '../merge/blocklist.ts';
import type { Entity } from '../types.ts';

describe('itemHash', () => {
  it('matches real 5etools sublist hashes', () => {
    expect(itemHash("Thieves' Tools", 'XPHB')).toBe("thieves'%20tools_xphb");
    expect(itemHash('Clothing, Cold Weather', 'IDRotF')).toBe(
      'clothing%2c%20cold%20weather_idrotf',
    );
    expect(itemHash('Arrows (20)', 'XPHB')).toBe('arrows%20(20)_xphb');
    expect(itemHash("Champion's Weapon", 'MonstersOfDrakkenheim')).toBe(
      "champion's%20weapon_monstersofdrakkenheim",
    );
  });
});

describe('hashToName', () => {
  it('recovers a display name + source', () => {
    expect(hashToName("thieves'%20tools_xphb")).toEqual({
      name: "Thieves' Tools",
      source: 'XPHB',
    });
  });
});

describe('resolveItemList', () => {
  const items: Entity[] = [
    { name: 'Rope', source: 'XPHB', type: 'G', value: 100, weight: 10 },
    { name: 'Torch', source: 'XPHB', type: 'G', value: 1, weight: 1 },
  ];
  const index = buildItemIndex(items);

  it('resolves entries, sums value×qty, and flags missing', () => {
    const out = resolveItemList(
      [
        { h: itemHash('Rope', 'XPHB'), c: 2 },
        { h: 'nonexistent_zzz', c: 1 },
      ],
      index,
    );
    expect(out.foundCount).toBe(1);
    expect(out.missingCount).toBe(1);
    expect(out.totalCp).toBe(200); // 100 × 2
    const rope = out.rows[0];
    expect(rope.found).toBe(true);
    expect(rope.name).toBe('Rope');
    expect(rope.quantity).toBe(2);
    expect(out.rows[1].found).toBe(false);
    expect(out.rows[1].name).toBe('Nonexistent');
  });
});

describe('resolveItemList with a site snapshot', () => {
  const index = buildItemIndex([
    { name: 'Longsword', source: 'XPHB', type: 'M', value: 1500 },
  ]);
  const blocklist = buildBlocklistLookup({
    blocklist: [{ hash: '*', category: '*', source: 'BLK' }],
  });

  it('shows an entry the catalog lacks as the site showed it, and counts its value', () => {
    const out = resolveItemList(
      [
        { h: itemHash('+1 Longsword', 'XDMG'), c: 2, name: '+1 Longsword', source: 'XDMG', value: 101500 },
        { h: itemHash('Longsword', 'XPHB'), c: 1 },
      ],
      index,
      blocklist,
    );
    expect(out.rows[0]).toMatchObject({
      found: false,
      name: '+1 Longsword',
      source: 'XDMG',
      valueCp: 101500,
      unresolvedReason: 'site',
    });
    expect(out.totalCp).toBe(2 * 101500 + 1500);
  });

  it('still reports a blocklisted entry as blocklisted, outside the total', () => {
    const out = resolveItemList(
      [{ h: itemHash('Gone', 'BLK'), c: 1, name: 'Gone', source: 'BLK', value: 500 }],
      index,
      blocklist,
    );
    expect(out.rows[0]).toMatchObject({ unresolvedReason: 'blocklisted', valueCp: null });
    expect(out.totalCp).toBe(0);
  });
});

describe('normalizeVariantItem', () => {
  it('hoists inherits source/value/rarity so a generic variant indexes', () => {
    const variant: Entity = {
      name: 'Vorpal Sword',
      inherits: { source: 'XDMG', value: 80000, rarity: 'legendary' },
    };
    const n = normalizeVariantItem(variant);
    expect(n.source).toBe('XDMG');
    expect(n.value).toBe(80000);
    expect(n.rarity).toBe('legendary');
    expect(n.type).toBe('GV'); // no inherits.type → generic-variant marker

    // …and now it can be found by hash, where before it couldn't.
    const index = buildItemIndex([n]);
    expect(index.get(itemHash('Vorpal Sword', 'XDMG'))).toBeDefined();
  });

  it('leaves a normal item untouched', () => {
    const item: Entity = {
      name: 'Rope',
      source: 'XPHB',
      type: 'G',
      value: 100,
    };
    expect(normalizeVariantItem(item)).toEqual(item);
  });
});
describe('classifyUnresolved', () => {
  it('flags a fully blocklisted source', () => {
    const lookup = buildBlocklistLookup({
      blocklist: [{ hash: '*', category: '*', source: 'TLotRR' }],
    });
    expect(classifyUnresolved('darts_tlotrr', lookup)).toBe('blocklisted');
  });

  it('treats other missing hashes as stale', () => {
    const lookup = buildBlocklistLookup({ blocklist: [] });
    expect(classifyUnresolved('writing%20kit_tdcsr', lookup)).toBe('stale');
  });
});

describe('itemGroup indexing', () => {
  it('resolves item group parents by hash', () => {
    const index = buildItemIndex([
      {
        name: 'Musical Instrument',
        source: 'XPHB',
        type: 'INS|XPHB',
        items: ['Bagpipes|XPHB'],
      },
    ]);
    const out = resolveItemList(
      [{ h: itemHash('Musical Instrument', 'XPHB'), c: 1 }],
      index,
    );
    expect(out.foundCount).toBe(1);
    expect(out.rows[0].name).toBe('Musical Instrument');
    expect(out.rows[0].type).toBe('INS');
  });
});

describe('resolveItemList with spells and shop costs', () => {
  const items = buildItemIndex([{ name: 'Rope', source: 'PHB', type: 'G', value: 100 }]);
  const spells = buildItemIndex([{ name: 'Fireball', source: 'XPHB', level: 3 }]);
  const blocklist = buildBlocklistLookup({
    blocklist: [{ hash: '*', category: 'spell', source: 'BLK' }],
  });

  it('resolves a spell entry against the spells, as a scroll unless set otherwise', () => {
    const out = resolveItemList(
      [
        { h: itemHash('Fireball', 'XPHB'), c: 1, page: 'spells.html' },
        { h: itemHash('Fireball', 'XPHB'), c: 1, page: 'spells.html', as: 'spell' },
      ],
      items,
      blocklist,
      spells,
    );
    expect(out.rows[0]).toMatchObject({ found: true, kind: 'spell', level: 3, as: 'scroll', valueCp: null });
    expect(out.rows[1].as).toBe('spell');
  });

  it('charges the entry’s cost in gp over the item’s own value, and totals it', () => {
    const out = resolveItemList(
      [
        { h: itemHash('Rope', 'PHB'), c: 2, cost: 1.5 },
        { h: itemHash('Fireball', 'XPHB'), c: 1, page: 'spells.html', cost: 200 },
      ],
      items,
      blocklist,
      spells,
    );
    expect(out.rows[0]).toMatchObject({ baseValueCp: 100, valueCp: 150 });
    expect(out.rows[1]).toMatchObject({ baseValueCp: null, valueCp: 20000 });
    expect(out.totalCp).toBe(2 * 150 + 20000);
  });

  it('reports a blocklisted spell and leaves it out of the total', () => {
    const out = resolveItemList(
      [{ h: itemHash('Hex Bolt', 'BLK'), c: 1, page: 'spells.html', name: 'Hex Bolt', source: 'BLK', cost: 50 }],
      items,
      blocklist,
      spells,
    );
    expect(out.rows[0]).toMatchObject({ unresolvedReason: 'blocklisted', valueCp: null });
    expect(out.totalCp).toBe(0);
  });
});
