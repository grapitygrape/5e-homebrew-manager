/**
 * Tests for who can receive what from the site browser. Imports the module's
 * own lib/send.js, like foundry-match.test.ts does, so the shipped code is
 * what's tested.
 */
import { describe, it, expect } from 'vitest';
import {
  addCurrency,
  buildTargets,
  canReceive,
  classifyPacket,
} from '../../../../foundry-homebrew-bridge/scripts/lib/send.js';

const entity = (page: string) => ({ type: 'entity', page });
const loot = { type: '5etools.lootgen.loot' };

const actor = (
  id: string,
  type: string,
  name: string,
  playerCharacters?: unknown[],
) => ({
  id,
  uuid: `Actor.${id}`,
  type,
  name,
  system: { playerCharacters },
});

describe('classifyPacket', () => {
  it('reads loot and currency from the packet type', () => {
    expect(classifyPacket(loot)).toBe('loot');
    expect(classifyPacket({ type: 'currency' })).toBe('currency');
  });

  it('reads entities from their page', () => {
    expect(classifyPacket(entity('items.html'))).toBe('item');
    expect(classifyPacket(entity('spells.html'))).toBe('spell');
    expect(classifyPacket(entity('bestiary.html'))).toBe('actor');
    expect(classifyPacket(entity('vehicles.html'))).toBe('actor');
    expect(classifyPacket(entity('objects.html'))).toBe('actor');
    expect(classifyPacket(entity('feats.html'))).toBe('other');
  });

  it('does not mind a page in another case', () => {
    expect(classifyPacket(entity('Spells.HTML'))).toBe('spell');
  });
});

describe('canReceive', () => {
  it('lets a character take anything but another actor', () => {
    expect(canReceive('character', entity('items.html'))).toBe(true);
    expect(canReceive('character', entity('spells.html'))).toBe(true);
    expect(canReceive('character', entity('feats.html'))).toBe(true);
    expect(canReceive('character', loot)).toBe(true);
    expect(canReceive('character', entity('bestiary.html'))).toBe(false);
  });

  it.each(['party', 'group', 'encounter'])(
    'lets a %s hold items, spells as scrolls, loot and coins only',
    (kind) => {
      expect(canReceive(kind, entity('items.html'))).toBe(true);
      expect(canReceive(kind, entity('spells.html'))).toBe(true);
      expect(canReceive(kind, loot)).toBe(true);
      expect(canReceive(kind, { type: 'currency' })).toBe(true);
      expect(canReceive(kind, entity('feats.html'))).toBe(false);
      expect(canReceive(kind, entity('bestiary.html'))).toBe(false);
    },
  );
});

describe('buildTargets', () => {
  const pc = actor('pc', 'character', 'Vex');
  const world = [
    actor('enc', 'encounter', 'Goblin Ambush'),
    actor('npc', 'npc', 'Goblin'),
    actor('veh', 'vehicle', 'Wagon'),
    actor('crew', 'group', 'Ship Crew', []),
    actor('adv', 'group', 'Adventurers', [pc]),
    actor('prime', 'group', 'The Company', []),
    pc,
    actor('pc2', 'character', 'Aria'),
  ];

  it('lists characters, parties, groups and encounters, skipping the rest', () => {
    const targets = buildTargets(world, 'prime', [entity('items.html')]);
    expect(targets.map((t: { name: string }) => t.name)).toEqual([
      'Aria',
      'Vex',
      'The Company',
      'Adventurers',
      'Ship Crew',
      'Goblin Ambush',
    ]);
  });

  it('calls a group a party if it is primary or holds a character', () => {
    const kinds = Object.fromEntries(
      buildTargets(world, 'prime', [entity('items.html')]).map(
        (t: { name: string; kind: string }) => [t.name, t.kind],
      ),
    );
    expect(kinds['The Company']).toBe('party');
    expect(kinds['Adventurers']).toBe('party');
    expect(kinds['Ship Crew']).toBe('group');
    expect(kinds['Goblin Ambush']).toBe('encounter');
    expect(kinds['Vex']).toBe('character');
  });

  it('carries the folder, to tell apart actors with the same name', () => {
    const filed = { ...actor('a', 'character', 'Vex'), folder: { name: 'Archive' } };
    const loose = actor('b', 'character', 'Vex');
    const folders = buildTargets([filed, loose], null, []).map(
      (t: { uuid: string; folder: string }) => [t.uuid, t.folder],
    );
    expect(Object.fromEntries(folders)).toEqual({
      'Actor.a': 'Archive',
      'Actor.b': '',
    });
  });

  it('blocks a target that cannot take everything being sent', () => {
    const blocked = (packets: { type: string; page?: string }[]) =>
      buildTargets(world, null, packets)
        .filter((t: { blocked: boolean }) => t.blocked)
        .map((t: { name: string }) => t.name);

    expect(blocked([entity('items.html')])).toEqual([]);
    expect(blocked([entity('feats.html')])).toEqual([
      'Adventurers',
      'Ship Crew',
      'The Company',
      'Goblin Ambush',
    ]);
    // One feat in a batch of items blocks what the feat can't go on.
    expect(blocked([entity('items.html'), entity('feats.html')])).toContain(
      'Goblin Ambush',
    );
    expect(blocked([entity('bestiary.html')])).toHaveLength(6);
  });
});

describe('addCurrency', () => {
  it('adds to what the actor holds and leaves other coins alone', () => {
    expect(addCurrency({ gp: 10, sp: 5, cp: 0 }, { gp: 3, cp: 7 })).toEqual({
      gp: 13,
      sp: 5,
      cp: 7,
    });
  });

  it('copes with an actor holding nothing yet', () => {
    expect(addCurrency(undefined, { pp: 2 })).toEqual({ pp: 2 });
  });
});
