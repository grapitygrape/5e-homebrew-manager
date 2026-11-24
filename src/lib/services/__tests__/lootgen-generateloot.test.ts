import { describe, expect, it } from 'vitest';
import {
  getCoinFormulaRange,
  getCountAvailable,
  getCrDefaults,
  getDistinctRolls,
  getItemPool,
  getActiveRarities,
  getItemTypes,
  getKindPool,
  isPotion,
  isScroll,
  getScrollItem,
  getScrollSpells,
  rollGold,
} from '../../../../deploy-modules/loot-generator/lootgen-generateloot-logic.js';

const HOARDS = [
  { source: 'DMG', crMin: 0, crMax: 4, coins: { gp: '2d6*10' } },
  { source: 'XDMG', crMin: 0, crMax: 4, coins: { gp: '2d4*100' } },
  { source: 'XDMG', crMin: 5, crMax: 10, coins: { gp: '8d10*100' } },
  { source: 'XDMG', crMin: 17, crMax: 30, coins: { gp: '6d10*10000' } },
];

const potion = { name: 'Potion', rarity: 'rare', type: 'P|XPHB', _textTypes: ['potion'] };
const staff = { name: 'Staff', rarity: 'rare', staff: true, _textTypes: ['staff', 'melee weapon'] };
const component = { name: 'Apple', rarity: 'rare', _textTypes: ['component'] };
const untyped = { name: 'Oddity', rarity: 'rare' };
const uncommon = { name: 'Wand', rarity: 'uncommon', _textTypes: ['wand'] };
const mundane = { name: 'Rope', rarity: 'none', _textTypes: ['adventuring gear'] };
const generic = { name: '+1 Weapon', rarity: 'rare', _category: 'Generic Variant', _textTypes: ['generic variant'] };
const scroll = { name: 'Scroll', rarity: 'rare', spellScrollLevel: 4, source: 'XDMG', type: 'SC|XPHB', _textTypes: ['scroll'] };
const ITEMS = [potion, staff, component, untyped, uncommon, mundane, generic, scroll];

describe('generate loot rules', () => {
  it('reads the range a coin formula can roll', () => {
    expect(getCoinFormulaRange('2d4*100')).toEqual({ min: 200, max: 800 });
    expect(getCoinFormulaRange('3d6')).toEqual({ min: 3, max: 18 });
    expect(getCoinFormulaRange(undefined)).toEqual({ min: 0, max: 0 });
  });

  it('suggests gold from the 2024 hoard row for the CR', () => {
    expect(getCrDefaults({ cr: '1/4', hoards: HOARDS })).toMatchObject({ goldMin: 200, goldMax: 800 });
    expect(getCrDefaults({ cr: '7', hoards: HOARDS })).toMatchObject({ goldMin: 800, goldMax: 8000 });
    expect(getCrDefaults({ cr: '30', hoards: HOARDS })).toMatchObject({ goldMin: 60000, goldMax: 600000 });
  });

  it('suggests rarer items at higher CRs and every rarity gets a row', () => {
    const low = getCrDefaults({ cr: '0', hoards: HOARDS }).rarities;
    const high = getCrDefaults({ cr: '20', hoards: HOARDS }).rarities;
    expect(low.common).toEqual({ availability: 'guaranteed', count: 2 });
    expect(low.legendary).toEqual({ availability: 'none', count: 0 });
    expect(high.common).toEqual({ availability: 'none', count: 0 });
    expect(high.legendary).toEqual({ availability: 'possible', count: 1 });
    expect(Object.keys(high)).toHaveLength(6);
  });

  it('rolls gold inside the range, either way round', () => {
    expect(rollGold({ min: 100, max: 200, rng: () => 0 })).toBe(100);
    expect(rollGold({ min: 100, max: 200, rng: () => 0.9999 })).toBe(200);
    expect(rollGold({ min: 200, max: 100, rng: () => 0 })).toBe(100);
  });

  it('rolls each thing against its availability', () => {
    expect(getCountAvailable({ availability: 'none', count: 5, rng: () => 0 })).toBe(0);
    expect(getCountAvailable({ availability: 'guaranteed', count: 3, rng: () => 0.9999 })).toBe(3);
    const rolls = [0.1, 0.9, 0.4];
    expect(getCountAvailable({ availability: 'possible', count: 3, rng: () => rolls.shift()! })).toBe(2);
  });

  it('offers only the types of items that can be rolled', () => {
    expect(getItemTypes(ITEMS)).toEqual(['component', 'other', 'staff', 'wand']);
  });

  it('pools by rarity and drops mundane, generic and spell scroll items', () => {
    expect(getItemPool({ items: ITEMS, rarity: 'rare' })).toEqual([staff, component, untyped]);
    expect(getItemPool({ items: ITEMS, rarity: 'none' })).toEqual([]);
  });


  it('removes an item when any of its specific types is unticked', () => {
    const tattoo = { name: 'Tattoo', rarity: 'rare', _textTypes: ['wondrous item', 'tattoo'] };
    const fire = { name: 'Alchemical Fire', rarity: 'rare', _textTypes: ['concoction', 'ranged weapon'] };
    const items = [tattoo, fire];
    expect(getItemPool({ items, rarity: 'rare', excludedTypes: ['tattoo', 'concoction'] })).toEqual([]);
    expect(getItemPool({ items, rarity: 'rare', excludedTypes: ['ranged weapon'] })).toEqual([tattoo]);
  });

  it('lets a specific type stand alone from wondrous item and a staff from melee weapon', () => {
    const tattoo = { name: 'Tattoo', rarity: 'rare', _textTypes: ['wondrous item', 'tattoo'] };
    const cloak = { name: 'Cloak', rarity: 'rare', _textTypes: ['wondrous item'] };
    expect(getItemPool({ items: [tattoo, cloak], rarity: 'rare', excludedTypes: ['wondrous item'] })).toEqual([tattoo]);
    expect(getItemPool({ items: [staff], rarity: 'rare', excludedTypes: ['melee weapon'] })).toEqual([staff]);
    expect(getItemPool({ items: [staff], rarity: 'rare', excludedTypes: ['staff'] })).toEqual([]);
  });

  it('ignores descriptive types, so unticking melee weapon removes longswords', () => {
    const longsword = { name: 'Longsword', rarity: 'rare', _textTypes: ['martial weapon', 'melee weapon'] };
    expect(getItemPool({ items: [longsword], rarity: 'rare', excludedTypes: ['melee weapon'] })).toEqual([]);
    expect(getItemTypes([longsword])).toEqual(['melee weapon']);
  });

  it('keeps potions and scrolls out of the types, and out of the pool unless included', () => {
    const items = [potion, scroll, component];
    expect(getItemTypes(items)).toEqual(['component']);
    expect(getItemPool({ items, rarity: 'rare' })).toEqual([component]);
    expect(getItemPool({ items, rarity: 'rare', isIncludePotions: true })).toEqual([potion, component]);
    expect(getItemPool({ items, rarity: 'rare', isIncludeScrolls: true })).toEqual([scroll, component]);
    // The type checkboxes have no say over them once they're included
    expect(getItemPool({ items, rarity: 'rare', isIncludePotions: true, excludedTypes: ['potion'] })).toEqual([
      potion,
      component,
    ]);
  });

  it('counts a rarity as active only with both an availability and a count', () => {
    expect(
      getActiveRarities({
        common: { availability: 'none', count: 3 },
        uncommon: { availability: 'likely', count: 0 },
        rare: { availability: 'scarce', count: 1 },
      }),
    ).toEqual(['rare']);
  });

  it('chooses guaranteed potions by the active rarities, falling back to any', () => {
    const common = { name: 'Healing', rarity: 'common', type: 'P|XPHB' };
    const items = [common, potion, scroll];
    expect(getKindPool({ items, fnIsKind: isPotion, rarities: ['rare'] })).toEqual([potion]);
    expect(getKindPool({ items, fnIsKind: isPotion, rarities: ['legendary'] })).toEqual([common, potion]);
    expect(getKindPool({ items, fnIsKind: isPotion })).toEqual([common, potion]);
    expect(getKindPool({ items, fnIsKind: isScroll })).toEqual([scroll]);
  });

  it('avoids repeating a row until every row is used', () => {
    expect(getDistinctRolls({ count: 3, size: 3 }).sort()).toEqual([1, 2, 3]);
    const repeats = getDistinctRolls({ count: 5, size: 2 });
    expect(repeats).toHaveLength(5);
    expect(repeats.slice(0, 2).sort()).toEqual([1, 2]);
    expect(getDistinctRolls({ count: 2, size: 0 })).toEqual([]);
  });

  it('filters scroll spells by school only when one is chosen', () => {
    const spells = [{ school: 'V' }, { school: 'A' }];
    expect(getScrollSpells({ spells })).toEqual(spells);
    expect(getScrollSpells({ spells, school: 'A' })).toEqual([{ school: 'A' }]);
  });

  it('treats an item holding a spell as a normal item, not a scroll', () => {
    const enspelled = { name: 'Enspelled Staff', rarity: 'rare', source: 'XDMG', spellScrollLevel: 3, type: 'M|XPHB' };
    const real = { name: 'Spell Scroll', rarity: 'rare', source: 'DMG', spellScrollLevel: 3, type: 'SC|DMG' };
    expect(getScrollItem({ items: [enspelled, real], level: 3 })).toBe(real);
    expect(getItemPool({ items: [enspelled, real], rarity: 'rare' })).toEqual([enspelled]);
  });

  it('prefers the 2024 scroll for a spell level', () => {
    const classic = { name: 'Old', source: 'DMG', spellScrollLevel: 1, type: 'SC|DMG' };
    const current = { name: 'New', source: 'XDMG', spellScrollLevel: 1, type: 'SC|XPHB' };
    const brew = { name: 'Brew', source: 'X', spellScrollLevel: 2, type: 'SC' };
    expect(getScrollItem({ items: [classic, current], level: 1 })).toBe(current);
    expect(getScrollItem({ items: [classic], level: 1 })).toBe(classic);
    expect(getScrollItem({ items: [brew], level: 2 })).toBe(brew);
    expect(getScrollItem({ items: [classic], level: 9 })).toBeNull();
  });
});
