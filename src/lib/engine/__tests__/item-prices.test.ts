/** Tests for engine/item-prices.ts — the price list and the deploy-time pricer. */
import { describe, it, expect } from 'vitest';
import {
  buildPriceLookup,
  mergePrices,
  parsePriceFile,
  parsePriceImport,
  prefillSources,
  priceDocument,
  priceKey,
  rowMatches,
  seedPrices,
  stringifyPriceFile,
  toSources,
} from '../item-prices.ts';
import pricesFixture from './fixtures/item-prices/prices.json';
import inputFixture from './fixtures/item-prices/input.json';
import expectedFixture from './fixtures/item-prices/expected.json';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('priceDocument', () => {
  // The Rust pricer runs the same fixture, so the two can't drift apart.
  it('matches the shared fixture', () => {
    const doc = clone(inputFixture) as Record<string, unknown>;
    const count = priceDocument(doc, parsePriceFile(pricesFixture));
    expect(doc).toEqual(expectedFixture.doc);
    expect(count).toBe(expectedFixture.count);
  });

  it('keeps the first original when a priced doc is priced again', () => {
    const rows = parsePriceFile(pricesFixture);
    const doc = clone(inputFixture) as Record<string, unknown>;
    priceDocument(doc, rows);
    priceDocument(doc, rows);
    expect(doc).toEqual(expectedFixture.doc);
  });

  it('leaves a doc with no matching items untouched', () => {
    const doc = { item: [{ name: 'Torch', source: 'PHB', value: 1 }] };
    expect(priceDocument(doc, parsePriceFile(pricesFixture))).toBe(0);
    expect(doc).toEqual({ item: [{ name: 'Torch', source: 'PHB', value: 1 }] });
  });
});

describe('buildPriceLookup', () => {
  const rows = parsePriceFile(pricesFixture);
  const lookup = buildPriceLookup(rows);

  it('prefers a row listing the item source over a wildcard row', () => {
    expect(lookup('bag of holding', 'xdmg')?.cost).toBe(450.5);
    expect(lookup('Bag of Holding', 'DMG')?.cost).toBe(400);
    expect(lookup('Bag of Holding', 'TCE')?.cost).toBe(400);
  });

  it('matches only the listed sources when a row has no wildcard', () => {
    expect(lookup('Rope of Climbing', 'DMG')?.cost).toBe(2000);
    expect(lookup('Rope of Climbing', 'XDMG')).toBeNull();
  });

  it('returns null for an unknown name', () => {
    expect(lookup('Torch', 'PHB')).toBeNull();
  });
});

describe('parsePriceImport', () => {
  it('reads CSV with a BOM, any column order and quoted commas', () => {
    const csv =
      '﻿cost,Name,source,max\r\n' +
      '480,"Necklace of Fireballs, Two Beads",,\r\n' +
      '400,Bag of Holding,XDMG,600\r\n';
    expect(parsePriceImport(csv)).toEqual({
      rows: [
        { name: 'Necklace of Fireballs, Two Beads', source: ['*'], cost: 480 },
        { name: 'Bag of Holding', source: ['XDMG'], cost: 400, max: 600 },
      ],
      errors: [],
    });
  });

  it('reads a JSON file or a bare array', () => {
    const one = parsePriceImport('{"prices":[{"name":"Rope","cost":1}]}');
    const two = parsePriceImport('[{"name":"Rope","cost":"1"}]');
    expect(one.rows).toEqual([{ name: 'Rope', source: ['*'], cost: 1 }]);
    expect(two.rows).toEqual([{ name: 'Rope', source: ['*'], cost: 1 }]);
  });

  it('reads a quoted list of sources in one CSV cell', () => {
    expect(parsePriceImport('name,source,cost\nWand,"DMG, XDMG, *",12\n').rows).toEqual([
      { name: 'Wand', source: ['DMG', 'XDMG', '*'], cost: 12 },
    ]);
  });

  it('rejects a row with no usable cost, naming its line', () => {
    const res = parsePriceImport('name,cost\nRope,\nTorch,abc\nOil,2\n');
    expect(res.rows).toEqual([{ name: 'Oil', source: ['*'], cost: 2 }]);
    expect(res.errors).toEqual([
      'Line 2: "Rope" has no cost.',
      'Line 3: "Torch" has no cost.',
    ]);
  });

  it('needs name and cost columns', () => {
    expect(parsePriceImport('item,price\nRope,1\n').errors).toEqual([
      'The CSV needs a "name" and a "cost" column.',
    ]);
  });
});

describe('mergePrices', () => {
  it('replaces rows with the same name and sources, keeps the rest', () => {
    const merged = mergePrices(
      [
        { name: 'Rope', source: ['*'], cost: 1 },
        { name: 'Rope', source: ['PHB'], cost: 2 },
      ],
      [
        { name: 'rope', source: ['*'], cost: 5 },
        { name: 'Torch', source: ['*'], cost: 3 },
      ],
    );
    expect(merged).toEqual([
      { name: 'rope', source: ['*'], cost: 5 },
      { name: 'Rope', source: ['PHB'], cost: 2 },
      { name: 'Torch', source: ['*'], cost: 3 },
    ]);
  });

  it('takes overlapping sources off an existing row and keeps the rest of it', () => {
    const merged = mergePrices(
      [
        { name: 'Wand', source: ['DMG', 'XDMG', '*'], cost: 1 },
        { name: 'Rope', source: ['PHB'], cost: 2 },
        { name: 'Wand', source: ['ERLW'], cost: 3 },
      ],
      [{ name: 'wand', source: ['xdmg', 'ERLW'], cost: 9 }],
    );
    expect(merged).toEqual([
      { name: 'wand', source: ['xdmg', 'ERLW'], cost: 9 },
      { name: 'Wand', source: ['DMG', '*'], cost: 1 },
      { name: 'Rope', source: ['PHB'], cost: 2 },
    ]);
  });
});

describe('toSources', () => {
  it('reads arrays and comma lists, drops repeats and puts * last', () => {
    expect(toSources(['*', 'DMG', 'dmg', ' XDMG '])).toEqual(['DMG', 'XDMG', '*']);
    expect(toSources('GGR, *, ')).toEqual(['GGR', '*']);
  });

  it('treats nothing as any source', () => {
    expect(toSources(undefined)).toEqual(['*']);
    expect(toSources('')).toEqual(['*']);
    expect(toSources([' '])).toEqual(['*']);
  });
});

describe('prefillSources', () => {
  it('adds * only when the name is printed in more than one source', () => {
    expect(prefillSources(['XDMG', 'DMG'])).toEqual(['DMG', 'XDMG', '*']);
    expect(prefillSources(['GGR'])).toEqual(['GGR']);
    expect(prefillSources([])).toEqual(['*']);
  });
});

describe('seedPrices', () => {
  it('turns item and variant values into gp rows with their printed sources', () => {
    expect(
      seedPrices(
        [
          { name: 'Bag of Holding', source: 'SMIPE', value: 40000 },
          { name: 'No Price', source: 'SMIPE' },
          { name: '+1 Weapon', inherits: { source: 'SMIPE', value: 100000 } },
          { name: 'Mizzium Mortar', source: 'SMIPE', value: 5000 },
        ],
        { 'bag of holding': ['XDMG', 'DMG'], 'mizzium mortar': ['GGR'] },
      ),
    ).toEqual([
      { name: 'Bag of Holding', source: ['DMG', 'XDMG', '*'], cost: 400 },
      { name: '+1 Weapon', source: ['*'], cost: 1000 },
      { name: 'Mizzium Mortar', source: ['GGR'], cost: 50 },
    ]);
  });
});

describe('rowMatches', () => {
  it('gives a wildcard the sources no row lists', () => {
    const names = { 'bag of holding': ['DMG', 'XDMG', 'TCE'], rope: ['PHB'] };
    const matches = rowMatches(
      [
        { name: 'Bag of Holding', source: ['DMG', '*'], cost: 400 },
        { name: 'Bag of Holding', source: ['xdmg'], cost: 450 },
        { name: 'Rope', source: ['XPHB'], cost: 1 },
        { name: 'Nothing', source: ['*'], cost: 1 },
      ],
      names,
    );
    expect(matches).toEqual([['DMG', 'TCE'], ['XDMG'], [], []]);
  });
});

describe('price file', () => {
  it('round-trips and drops junk rows', () => {
    const rows = parsePriceFile({
      prices: [{ name: 'Rope', cost: 1, min: '' }, { name: '', cost: 1 }, { cost: 2 }],
    });
    expect(rows).toEqual([{ name: 'Rope', source: ['*'], cost: 1 }]);
    expect(parsePriceFile(JSON.parse(stringifyPriceFile(rows)))).toEqual(rows);
  });

  it('keys by lower-cased name and source', () => {
    expect(priceKey('Rope', 'PHB')).toBe('rope|phb');
    expect(priceKey('Rope', '*')).toBe('rope|*');
  });

  it('writes source as an array', () => {
    expect(stringifyPriceFile(parsePriceFile({ prices: [{ name: 'Rope', source: 'PHB', cost: 1 }] })))
      .toContain('"source": ["PHB"],');
  });
});
