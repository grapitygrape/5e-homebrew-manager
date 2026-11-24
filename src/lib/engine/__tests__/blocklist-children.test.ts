/**
 * Tests for engine/blocklist/children.ts and flattenRacesWithParents —
 * parent → child extraction, descendant traversal, cascade candidates,
 * orphan detection, rule updates, and confirmation copy.
 */
import { describe, it, expect } from 'vitest';
import {
  applyCascade,
  cascadeCandidates,
  collectDescendants,
  describeChildSummary,
  describeTargetLabel,
  encodeForHash,
  entityGraphKey,
  entryKey,
  extractItemGroupMembers,
  extractParentLinks,
  findAllowedWithBlockedParents,
  flattenRacesWithParents,
} from '../blocklist/index.ts';
import type { BlocklistEntry, IndexedEntity } from '../blocklist/index.ts';

const ent = (prop: string, name: string, source: string): IndexedEntity => ({
  prop,
  name,
  source,
  hash: encodeForHash(name, source),
});

const rule = (
  hash: string,
  category: string,
  source: string,
  isAuto = false,
): BlocklistEntry => ({
  displayName: hash === '*' ? '*' : hash,
  hash,
  category,
  source,
  isAuto,
});

describe('extractParentLinks', () => {
  it('links a subclass to its class (cross-source and same-source)', () => {
    expect(
      extractParentLinks('subclass', {
        name: 'Alchemist',
        shortName: 'Alchemist',
        source: 'TCE',
        className: 'Artificer',
        classSource: 'TCE',
      }),
    ).toEqual([
      {
        parentProp: 'class',
        parentHash: encodeForHash('Artificer', 'TCE'),
      },
    ]);

    expect(
      extractParentLinks('subclass', {
        name: 'Maverick',
        shortName: 'Maverick',
        source: 'ArchEb',
        className: 'Artificer',
        classSource: 'TCE',
      }),
    ).toEqual([
      {
        parentProp: 'class',
        parentHash: encodeForHash('Artificer', 'TCE'),
      },
    ]);
  });

  it('links an item with baseItem to its baseitem (defaulting to PHB)', () => {
    expect(
      extractParentLinks('item', {
        name: 'Frost Brand',
        source: 'DMG',
        baseItem: 'greatsword',
      }),
    ).toEqual([
      {
        parentProp: 'baseitem',
        parentHash: encodeForHash('greatsword', 'PHB'),
      },
    ]);

    expect(
      extractParentLinks('item', {
        name: 'Arcane Revolver',
        source: 'UA2',
        baseItem: 'Revolver|UltimateAdventurer',
      }),
    ).toEqual([
      {
        parentProp: 'baseitem',
        parentHash: encodeForHash('Revolver', 'UltimateAdventurer'),
      },
    ]);
  });

  it('links a card to its deck and a summoned monster to its spell', () => {
    expect(
      extractParentLinks('card', {
        name: 'The Void',
        set: 'Deck of Many Things',
        source: 'DMG',
      }),
    ).toEqual([
      {
        parentProp: 'deck',
        parentHash: encodeForHash('Deck of Many Things', 'DMG'),
      },
    ]);

    expect(
      extractParentLinks('monster', {
        name: 'Reaper Spirit',
        source: 'BMT',
        summonedBySpell: 'Spirit of Death|BMT',
      }),
    ).toEqual([
      {
        parentProp: 'spell',
        parentHash: encodeForHash('Spirit of Death', 'BMT'),
      },
    ]);

    expect(
      extractParentLinks('monster', {
        name: 'Beast of the Land',
        source: 'TCE',
        summonedBySpell: 'Summon Beast',
      }),
    ).toEqual([
      {
        parentProp: 'spell',
        parentHash: encodeForHash('Summon Beast', 'PHB'),
      },
    ]);
  });

  it('ignores non-child props and missing parent references', () => {
    expect(
      extractParentLinks('monster', {
        name: 'Adult Red Dragon',
        source: 'MM',
        legendaryGroup: { name: 'Red Dragon', source: 'MM' },
      }),
    ).toEqual([]);
  });
});

describe('extractItemGroupMembers', () => {
  it('extracts itemGroup members with DMG default and own-source fallback', () => {
    expect(
      extractItemGroupMembers('itemGroup', {
        name: 'Absorbing Tattoo',
        source: 'TCE',
        items: ['Absorbing Tattoo, Acid|TCE', 'Generic Member'],
      }),
    ).toEqual([
      { name: 'Absorbing Tattoo, Acid', source: 'TCE', fallbackSource: undefined },
      { name: 'Generic Member', source: 'DMG', fallbackSource: 'TCE' },
    ]);
  });
});

describe('flattenRacesWithParents', () => {
  it('links merged subraces to their base race, including (Base) renames', () => {
    const res = flattenRacesWithParents(
      [
        {
          name: 'Human',
          source: 'PHB',
          subraces: [{ source: 'PHB' }, { name: 'Variant', source: 'PHB' }],
        },
        { name: 'Dwarf', source: 'PHB' },
      ],
      [{ name: 'Duergar', source: 'MTF', raceName: 'Dwarf', raceSource: 'PHB' }],
    );

    expect(res.links).toEqual([
      {
        parent: { name: 'Human (Base)', source: 'PHB' },
        child: { name: 'Human', source: 'PHB' },
      },
      {
        parent: { name: 'Human (Base)', source: 'PHB' },
        child: { name: 'Human (Variant)', source: 'PHB' },
      },
      {
        parent: { name: 'Dwarf', source: 'PHB' },
        child: { name: 'Dwarf (Duergar)', source: 'MTF' },
      },
    ]);
  });
});

describe('collectDescendants', () => {
  it('traverses multi-hop descendants, ignores cycles, and excludes seeds', () => {
    const group = ent('itemGroup', 'Magic Blades', 'HB');
    const base = ent('baseitem', 'Estoc', 'HB');
    const item = ent('item', 'Flame Estoc', 'HB2');

    const edges = new Map<string, IndexedEntity[]>([
      [entityGraphKey(group.prop, group.hash), [base]],
      [entityGraphKey(base.prop, base.hash), [item, group]], // cycle back to seed
    ]);

    const kids = collectDescendants([group], (k) => edges.get(k));
    expect(kids.map((k) => `${k.prop}:${k.name}`)).toEqual([
      'item:Flame Estoc',
      'baseitem:Estoc',
    ]);
  });
});

describe('findAllowedWithBlockedParents', () => {
  const artificer = ent('class', 'Artificer', 'TCE');
  const alchemist = ent('subclass', 'Alchemist', 'TCE');
  const maverick = ent('subclass', 'Maverick', 'ArchEb');
  const group = ent('itemGroup', 'Magic Blades', 'HB');
  const base = ent('baseitem', 'Estoc', 'HB');
  const item = ent('item', 'Flame Estoc', 'HB2');

  const edges = new Map<string, IndexedEntity[]>([
    [entityGraphKey(artificer.prop, artificer.hash), [alchemist, maverick]],
    [entityGraphKey(group.prop, group.hash), [base]],
    [entityGraphKey(base.prop, base.hash), [item]],
  ]);
  const parents = [artificer, group, base];
  const childrenOf = (k: string) => edges.get(k);

  it('returns empty when no rules are active', () => {
    expect(findAllowedWithBlockedParents(parents, childrenOf, [])).toEqual([]);
  });

  it('finds allowed children across same and different sources and omits already-blocked ones', () => {
    const exact = findAllowedWithBlockedParents(parents, childrenOf, [
      rule(artificer.hash, 'class', 'TCE'),
      rule(alchemist.hash, 'subclass', 'TCE'),
    ]);
    expect(exact).toEqual([
      {
        ...maverick,
        blockedParents: [
          {
            prop: 'class',
            name: 'Artificer',
            source: 'TCE',
            hash: artificer.hash,
          },
        ],
      },
    ]);

    // Whole-source TCE block covers Alchemist automatically, leaving only cross-source Maverick.
    const wholeSource = findAllowedWithBlockedParents(parents, childrenOf, [
      rule('*', '*', 'TCE'),
    ]);
    expect(wholeSource.map((i) => `${i.name}:${i.source}`)).toEqual([
      'Maverick:ArchEb',
    ]);
  });

  it('follows multi-hop blocked ancestors and deduplicates multiple blocked parents', () => {
    const res = findAllowedWithBlockedParents(parents, childrenOf, [
      rule(group.hash, 'itemGroup', 'HB'),
      rule(base.hash, 'baseitem', 'HB'),
    ]);
    expect(res).toEqual([
      {
        ...item,
        blockedParents: [
          { prop: 'baseitem', name: 'Estoc', source: 'HB', hash: base.hash },
          {
            prop: 'itemGroup',
            name: 'Magic Blades',
            source: 'HB',
            hash: group.hash,
          },
        ],
      },
    ]);
  });
});

describe('cascadeCandidates & applyCascade', () => {
  const tceSub = ent('subclass', 'Alchemist', 'TCE');
  const hbSub = ent('subclass', 'Maverick', 'ArchEb');
  const blockedSub = ent('subclass', 'Forge Adept', 'ExE');
  const autoSub = ent('subclass', 'Auto Sub', 'AUTO');
  const wildcardSub = ent('subclass', 'Wild Sub', 'TCEE2');

  it('on block, skips children the new parent rule or existing rules already cover', () => {
    // Blocking the whole source TCE covers tceSub itself, so only hbSub remains.
    const withParent = [
      rule(blockedSub.hash, 'subclass', 'ExE'),
      rule('*', '*', 'TCEE2'),
      rule('*', '*', 'TCE'),
    ];
    expect(
      cascadeCandidates('block', [tceSub, hbSub, blockedSub, wildcardSub], withParent),
    ).toEqual([hbSub]);
  });

  it('on unblock, only offers children with exact, non-auto rules', () => {
    const withoutParent = [
      rule(tceSub.hash, 'subclass', 'TCE', false),
      rule(hbSub.hash, 'subclass', 'ArchEb', false),
      rule(autoSub.hash, 'subclass', 'AUTO', true),
      rule('*', '*', 'TCEE2', false),
    ];
    expect(
      cascadeCandidates(
        'unblock',
        [tceSub, hbSub, autoSub, wildcardSub, blockedSub],
        withoutParent,
      ),
    ).toEqual([tceSub, hbSub]);
  });

  it('adds each child rule once and removes without touching auto rules', () => {
    const start = [
      rule(encodeForHash('Artificer', 'TCE'), 'class', 'TCE'),
      rule(autoSub.hash, 'subclass', 'AUTO', true),
      // Already present (different case): must not be added a second time.
      rule(hbSub.hash.toUpperCase(), 'subclass', 'archeb'),
    ];
    const added = applyCascade('block', start, [tceSub, hbSub, tceSub, autoSub]);
    expect(added.map(entryKey)).toEqual([
      entryKey(start[0]),
      entryKey(start[1]),
      entryKey(start[2]),
      entryKey({ hash: tceSub.hash, category: 'subclass', source: 'TCE' }),
    ]);

    const removed = applyCascade('unblock', added, [tceSub, autoSub]);
    expect(removed.map(entryKey)).toEqual([
      entryKey(start[0]),
      entryKey(start[1]),
      entryKey(start[2]),
    ]);
  });

  it('returns the same array when there is nothing to apply', () => {
    const start = [rule(tceSub.hash, 'subclass', 'TCE')];
    expect(applyCascade('block', start, [])).toBe(start);
    expect(applyCascade('block', start, [tceSub])).toBe(start);
  });
});

describe('describeChildSummary & describeTargetLabel', () => {
  it('formats singular, plural, and mixed child summaries', () => {
    expect(describeChildSummary([ent('subclass', 'Alchemist', 'TCE')])).toBe(
      '1 subclass',
    );
    expect(
      describeChildSummary([
        ent('subclass', 'Alchemist', 'TCE'),
        ent('subclass', 'Armorer', 'TCE'),
      ]),
    ).toBe('2 subclasses');
    expect(
      describeChildSummary([
        ent('race', 'Dwarf (Duergar)', 'MTF'),
        ent('monster', 'Bestial Spirit', 'TCE'),
      ]),
    ).toBe('1 race variant and 1 creature');
  });

  it('formats source, type, and exact target labels', () => {
    expect(
      describeTargetLabel({ hash: '*', category: '*', source: 'TCE' }),
    ).toBe('TCE');
    expect(
      describeTargetLabel({ hash: '*', category: 'class', source: 'TCE' }),
    ).toBe('Classes (TCE)');
    expect(
      describeTargetLabel({
        hash: 'artificer_tce',
        category: 'class',
        source: 'TCE',
        displayName: 'Artificer',
      }),
    ).toBe('Artificer (TCE)');
  });
});
