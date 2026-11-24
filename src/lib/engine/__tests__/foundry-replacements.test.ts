/**
 * The scan's two halves: the manager builds rules and lays out hits
 * (engine/foundry/replacements), the Foundry module matches documents
 * (imported here from the module's own source, as foundry-match.test does).
 */
import { describe, it, expect } from 'vitest';
import {
  buildReplacementData,
  documentReferences,
  importSwapData,
  indexRules,
  mapActivityIds,
  matchDocument,
  orderCandidates,
  parseRules,
  pickBySource,
  previousValues,
  relativeUuid,
  remapActorReferences,
  resolveRelativeUuid,
  rewriteReferences,
  ruleKey,
  sourceMatches,
} from '../../../../foundry-homebrew-bridge/scripts/lib/replacements.js';
import {
  buildScanRows,
  buildScanRules,
  enforcementStatus,
  rulesToSync,
  splitUid,
  worldsNeedingRules,
} from '../foundry/replacements.ts';
import type { SupersessionRow } from '../supersession';
import type { BridgeClientInfo, ScanHit } from '../foundry/types.ts';

const row = (name: string, source: string, uid: string): SupersessionRow => ({
  displayName: name,
  source,
  page: 'spells.html',
  hash: name.toLowerCase(),
  prop: 'spell',
  replacedBy: uid ? [{ page: 'spells.html', prop: 'spell', uid }] : [],
});

describe('buildScanRules', () => {
  it('uses the primary target and skips rows with none', () => {
    const rules = buildScanRules([
      row('Daylight', 'XPHB', 'Brilliance|SDS'),
      row('Shield', 'PHB', ''),
    ]);
    expect(rules).toEqual([
      {
        id: '0',
        originalName: 'Daylight',
        originalSource: 'XPHB',
        replacementName: 'Brilliance',
        replacementSource: 'SDS',
      },
    ]);
  });

  it('splits a uid on its last pipe', () => {
    expect(splitUid('Wand|of|Wonder|SDS')).toEqual({
      name: 'Wand|of|Wonder',
      source: 'SDS',
    });
  });
});

describe('rules sync', () => {
  const world = (clientId: string, features: string[]): BridgeClientInfo => ({
    clientId,
    world: clientId,
    worldId: clientId,
    system: 'dnd5e',
    systemVersion: '5.0.0',
    foundryVersion: '13',
    user: 'GM',
    connectedAt: 0,
    origin: 'http://localhost:30000',
    moduleVersion: '',
    features,
  });

  it('sends to each world that takes rules, once', () => {
    const clients = [
      world('new', ['open', 'scan', 'replace', 'rules']),
      world('done', ['open', 'scan', 'replace', 'rules']),
      world('old', ['open', 'scan', 'replace']),
    ];
    expect(
      worldsNeedingRules(clients, new Set(['done'])).map((c) => c.clientId),
    ).toEqual(['new']);
  });

  it('sends the saved rows, or nothing when there is no saved file', () => {
    const rows = [row('Daylight', 'XPHB', 'Brilliance|SDS')];
    expect(rulesToSync({ rows, fileExists: true })).toEqual(
      buildScanRules(rows),
    );
    // An empty saved file clears the world; a missing one leaves it alone.
    expect(rulesToSync({ rows: [], fileExists: true })).toEqual([]);
    expect(rulesToSync({ rows: [], fileExists: false })).toBeNull();
  });

  it('says what each world reports it enforces', () => {
    const rules = ['open', 'scan', 'replace', 'rules'];
    const on = { ...world('a', rules), world: 'Drakkenheim' };
    expect(
      enforcementStatus({
        ...on,
        enforcement: { imports: true, banner: true, rules: 412 },
      }),
    ).toEqual({
      variant: 'ok',
      text: 'Drakkenheim swaps 412 mappings on import.',
    });
    expect(
      enforcementStatus({
        ...on,
        enforcement: { imports: true, banner: false, rules: 1 },
      }).text,
    ).toBe('Drakkenheim swaps 1 mapping on import. Player banner off.');
    expect(
      enforcementStatus({
        ...on,
        enforcement: { imports: false, banner: true, rules: 412 },
      }),
    ).toEqual({
      variant: 'warning',
      text: "Drakkenheim isn't swapping on import. Turn it on in Foundry: Configure Settings, Homebrew Manager Bridge.",
    });
    expect(
      enforcementStatus({
        ...on,
        enforcement: { imports: true, banner: true, rules: 0 },
      }).variant,
    ).toBe('warning');
    expect(enforcementStatus(on)).toEqual({
      variant: 'default',
      text: 'Waiting for Drakkenheim to report its settings.',
    });
    expect(enforcementStatus(world('old', ['open', 'scan'])).variant).toBe(
      'warning',
    );
  });
});

describe('matchDocument', () => {
  const byName = indexRules(buildScanRules([row('Daylight', 'XPHB', 'Brilliance|SDS')]));

  it('matches on name and a source label naming the abbreviation', () => {
    const raw = { name: 'Daylight', system: { source: { book: 'XPHB' } } };
    expect(matchDocument(raw, byName)).toEqual({ ruleId: '0', state: 'original' });
  });

  it('does not match the same name from another source', () => {
    const raw = { name: 'Daylight', system: { source: { book: 'PHB' } } };
    expect(matchDocument(raw, byName)).toBeNull();
  });

  it('matches a document with no source on name alone', () => {
    expect(matchDocument({ name: 'daylight', system: {} }, byName)).toEqual({
      ruleId: '0',
      state: 'original',
    });
  });

  it('finds a renamed stand-in through its Custom Label', () => {
    const raw = {
      name: 'Craylight',
      system: { source: { book: 'SDS', custom: 'Replaces Daylight XPHB' } },
    };
    expect(matchDocument(raw, byName)).toEqual({ ruleId: '0', state: 'replaced' });
  });

  it('reads a label that holds more than the abbreviation', () => {
    expect(sourceMatches('XPHB 2024', 'XPHB')).toBe(true);
    expect(sourceMatches('PHB', 'XPHB')).toBe(false);
  });
});

describe('buildScanRows', () => {
  const rules = buildScanRules([row('Daylight', 'XPHB', 'Brilliance|SDS')]);
  const hit = (over: Partial<ScanHit>): ScanHit => ({
    uuid: 'Item.a',
    name: 'Daylight',
    docType: 'spell',
    ruleId: '0',
    state: 'original',
    location: { kind: 'world' },
    ...over,
  });

  const clem = {
    kind: 'actor',
    actorUuid: 'Actor.c',
    actorName: 'Clem',
    actorType: 'character',
  } as const;

  it('puts the place on the second line', () => {
    const rows = buildScanRows(
      [hit({ uuid: 'Actor.c.Item.a', location: clem }), hit({})],
      rules,
    );
    expect(rows.map((r) => [r.hit.name, r.where])).toEqual([
      ['Daylight', 'Character, Clem'],
      ['Daylight', 'World item'],
    ]);
    expect(rows[0].replaced).toBe('Daylight XPHB');
    expect(rows[0].replacedWith).toBe('Brilliance SDS');
  });

  it('leaves out a stand-in already swapped in', () => {
    const rows = buildScanRows(
      [
        hit({
          uuid: 'Actor.c.Item.b',
          name: 'Craylight',
          state: 'replaced',
          location: clem,
        }),
        hit({}),
      ],
      rules,
    );
    expect(rows.map((r) => r.hit.name)).toEqual(['Daylight']);
  });

  it('drops hits whose rule is unknown', () => {
    expect(buildScanRows([hit({ ruleId: '9' })], rules)).toEqual([]);
  });
});

describe('buildReplacementData', () => {
  const rule = { originalName: 'Daylight', originalSource: 'XPHB' };
  const old = {
    _id: 'old',
    sort: 300000,
    system: { container: 'bag', prepared: 1, quantity: 2 },
    flags: { 'tidy5e-sheet': { section: 'Healing', actionSection: 'Big' } },
  };
  const fresh = {
    _id: 'new',
    name: 'Brilliance',
    ownership: { default: 3 },
    system: { prepared: 0, source: { book: 'SDS' } },
    flags: {},
  };

  it('keeps the slot: sort, container, preparation, Tidy sections', () => {
    const data = buildReplacementData(old, fresh, rule);
    expect(data.sort).toBe(300000);
    expect(data.system.container).toBe('bag');
    expect(data.system.prepared).toBe(1);
    expect(data.flags['tidy5e-sheet']).toEqual({
      section: 'Healing',
      actionSection: 'Big',
    });
  });

  it('labels the source and leaves the replacement own fields', () => {
    const data = buildReplacementData(old, fresh, rule);
    expect(data.system.source).toEqual({
      book: 'SDS',
      custom: 'Replaces Daylight XPHB',
    });
    expect(data._id).toBeUndefined();
    expect(data.ownership).toBeUndefined();
    // quantity is not on the replacement, so it is not invented
    expect('quantity' in data.system).toBe(false);
  });

  it('stays tied to the advancement that granted the old item', () => {
    const granted = {
      ...old,
      flags: { dnd5e: { advancementOrigin: 'cls.adv', advancementRoot: 'cls.adv', sourceId: 'Compendium.p.spells.Item.day' } },
    };
    const data = buildReplacementData(granted, fresh, rule, 'Compendium.sds.spells.Item.bri');
    expect(data.flags.dnd5e).toEqual({
      advancementOrigin: 'cls.adv',
      advancementRoot: 'cls.adv',
      sourceId: 'Compendium.sds.spells.Item.bri',
    });
    expect(data._stats).toEqual({ compendiumSource: 'Compendium.sds.spells.Item.bri' });
  });

  it('records a world item as the source without claiming a compendium', () => {
    const data = buildReplacementData(old, fresh, rule, 'Item.bri');
    expect(data.flags.dnd5e).toEqual({ sourceId: 'Item.bri' });
    expect(data._stats).toBeUndefined();
  });
});

describe('importSwapData', () => {
  const rule = { originalName: 'Fireball', originalSource: 'PHB' };
  const fireball = {
    _id: 'kept',
    name: 'Fireball',
    type: 'spell',
    sort: 5,
    system: { method: 'innate', prepared: 1, source: { book: 'PHB 2024' } },
    // Neptunium's marks on what it imported; the replacement must not inherit them.
    flags: { plutonium: { page: 'spells.html', hash: 'fireball_phb' } },
  };
  const fireblast = {
    _id: 'pack-id',
    name: 'Fireblast',
    type: 'spell',
    system: { method: 'spell', prepared: 0, source: { book: 'SDS' } },
    flags: {},
  };

  it('becomes the replacement but keeps the id the importer asked for', () => {
    const data = importSwapData(fireball, fireblast, rule, 'Compendium.sds.spells.Item.fb');
    expect(data.name).toBe('Fireblast');
    expect(data._id).toBe('kept');
    expect(data.system.method).toBe('innate');
    expect(data.system.source.custom).toBe('Replaces Fireball PHB');
    expect(data.flags.plutonium).toBeUndefined();
  });

  it('leaves the id unset when the importer gave none', () => {
    const data = importSwapData({ ...fireball, _id: null }, fireblast, rule);
    expect('_id' in data).toBe(false);
  });

  it('refuses a replacement of another item type', () => {
    expect(importSwapData(fireball, { ...fireblast, type: 'feat' }, rule)).toBeNull();
  });
});

describe('documentReferences', () => {
  const subclass = {
    name: 'Oath of Glory',
    system: {
      description: {
        value: '<p>You learn @UUID[Compendium.p.spells.Item.day]{Daylight} and @UUID[Actor.a.Item.old].</p>',
      },
      advancement: {
        g1: {
          _id: 'g1',
          type: 'ItemGrant',
          level: 3,
          configuration: { items: [{ uuid: 'Compendium.p.spells.Item.day' }, { uuid: 'Compendium.p.spells.Item.other' }] },
          value: { added: { old: 'Compendium.p.spells.Item.day' } },
        },
        c1: {
          _id: 'c1',
          type: 'ItemChoice',
          configuration: { pool: [{ uuid: 'Compendium.p.spells.Item.day' }] },
          value: {},
        },
        s1: { _id: 's1', type: 'ScaleValue', configuration: {} },
      },
      activities: {
        k1: { type: 'cast', spell: { uuid: 'Compendium.p.spells.Item.day' } },
        k2: { type: 'attack' },
      },
    },
  };

  it('lists grants, choices, Cast activities and description links', () => {
    expect(documentReferences(subclass)).toEqual([
      { uuid: 'Compendium.p.spells.Item.day', kind: 'grant', level: 3 },
      { uuid: 'Compendium.p.spells.Item.other', kind: 'grant', level: 3 },
      { uuid: 'Compendium.p.spells.Item.day', kind: 'choice' },
      { uuid: 'Compendium.p.spells.Item.day', kind: 'cast' },
      { uuid: 'Compendium.p.spells.Item.day', kind: 'link' },
      { uuid: 'Actor.a.Item.old', kind: 'link' },
    ]);
  });

  it('reads old-style @Compendium links as compendium uuids', () => {
    const item = { system: { description: { value: 'See @Compendium[p.spells.day]{Daylight}.' } } };
    expect(documentReferences(item)).toEqual([{ uuid: 'Compendium.p.spells.day', kind: 'link' }]);
  });

  it('reads links in an actor biography', () => {
    const actor = { system: { details: { biography: { value: '@UUID[Actor.a.Item.old]{Daylight}', public: '' } } } };
    expect(documentReferences(actor)).toEqual([{ uuid: 'Actor.a.Item.old', kind: 'link' }]);
  });
});

describe('rewriteReferences', () => {
  const DAY = 'Compendium.p.spells.Item.day';
  const BRI = 'Compendium.sds.spells.Item.bri';
  const swap = {
    uuids: new Map([
      [DAY, BRI],
      ['Actor.a.Item.old', 'Actor.a.Item.new'],
    ]),
    oldName: 'Daylight',
    newName: 'Brilliance',
    oldId: 'old',
    newId: 'new',
    newUuid: BRI,
  };

  it('points grants, choice pools and granted-item records at the replacement', () => {
    const cls = {
      system: {
        advancement: {
          g1: {
            _id: 'g1',
            type: 'ItemGrant',
            configuration: { items: [{ uuid: DAY, optional: false }, { uuid: BRI }] },
            value: { added: { old: DAY, keep: 'Compendium.p.spells.Item.other' } },
          },
          c1: {
            _id: 'c1',
            type: 'ItemChoice',
            configuration: { pool: [{ uuid: DAY }] },
            value: {
              added: { 5: { old: DAY } },
              replaced: { 9: { level: 5, original: 'old', replacement: 'x' } },
            },
          },
        },
      },
    };
    const r = rewriteReferences(cls, swap);
    const adv = r.advancement!;
    // The grant already offered Brilliance, so it isn't listed twice.
    expect(adv.g1.configuration.items).toEqual([{ uuid: BRI, optional: false }]);
    expect(adv.g1.value.added).toEqual({
      new: BRI,
      keep: 'Compendium.p.spells.Item.other',
    });
    expect(adv.c1.configuration.pool).toEqual([{ uuid: BRI }]);
    expect(adv.c1.value.added).toEqual({ 5: { new: BRI } });
    expect(adv.c1.value.replaced[9]).toEqual({ level: 5, original: 'new', replacement: 'x' });
    expect(r.count).toBe(5);
    // The source document is never edited.
    expect(cls.system.advancement.g1.value.added).toHaveProperty('old');
  });

  it('repoints Cast activities and links, renaming a label that named the original', () => {
    const feat = {
      system: {
        description: {
          value: '@UUID[Compendium.p.spells.Item.day]{Daylight}, @UUID[Actor.a.Item.old]{the sun spell}, @UUID[Item.z]{Other}',
          chat: '',
        },
        activities: {
          k1: { type: 'cast', spell: { uuid: DAY } },
          k2: { type: 'cast', spell: { uuid: 'Item.z' } },
        },
      },
    };
    const r = rewriteReferences(feat, swap);
    expect(r.update).toEqual({
      'system.activities.k1.spell.uuid': BRI,
      'system.description.value':
        '@UUID[Compendium.sds.spells.Item.bri]{Brilliance}, @UUID[Actor.a.Item.new]{the sun spell}, @UUID[Item.z]{Other}',
    });
    expect(r.advancement).toBeNull();
    expect(r.count).toBe(3);
  });

  it('turns an old-style @Compendium link into a @UUID link', () => {
    const legacy = { ...swap, uuids: new Map([['Compendium.p.spells.day', BRI]]) };
    const feat = { system: { description: { value: '@Compendium[p.spells.day]{Daylight} or @Compendium[p.spells.other]' } } };
    expect(rewriteReferences(feat, legacy).update).toEqual({
      'system.description.value': `@UUID[${BRI}]{Brilliance} or @Compendium[p.spells.other]`,
    });
  });

  it('renames the original in the text of a document that references it', () => {
    const oath = {
      system: {
        description: {
          value:
            '<p class="Daylight">Daylight, <em>Daylight</em>, daylight, Daylighting, @UUID[Item.z]{Daylight}</p>',
        },
        activities: { k1: { type: 'cast', spell: { uuid: DAY } } },
      },
    };
    expect(rewriteReferences(oath, swap).update['system.description.value']).toBe(
      '<p class="Daylight">Brilliance, <em>Brilliance</em>, daylight, Daylighting, @UUID[Item.z]{Daylight}</p>',
    );
  });

  it('leaves the name alone in text that only mentions it', () => {
    const lore = { system: { description: { value: '<p>Daylight burns them.</p>' } } };
    expect(rewriteReferences(lore, swap).count).toBe(0);
  });

  it('moves items the old one granted over to the new one', () => {
    const child = { flags: { dnd5e: { advancementOrigin: 'old.g1', advancementRoot: 'cls.a9' } } };
    expect(rewriteReferences(child, swap).update).toEqual({
      'flags.dnd5e.advancementOrigin': 'new.g1',
    });
  });

  it('follows relative links to the old item, and keeps them relative', () => {
    const local = { ...swap, uuids: new Map([['Actor.a.Item.old', 'Actor.a.Item.new']]) };
    // Foundry writes a link dropped into the actor's own biography as `.Item.id`.
    const actor = {
      system: { details: { biography: { value: '', public: 'Relies on @UUID[.Item.old]{Daylight}.' } } },
    };
    expect(rewriteReferences(actor, local, 'Actor.a').update).toEqual({
      'system.details.biography.public': 'Relies on @UUID[.Item.new]{Brilliance}.',
    });
    // And one between two items on the same actor as just `.id`.
    const sibling = { system: { description: { value: 'See @UUID[.old]{Daylight}.' } } };
    expect(rewriteReferences(sibling, local, 'Actor.a.Item.z').update).toEqual({
      'system.description.value': 'See @UUID[.new]{Brilliance}.',
    });
    // Another actor's `.Item.old` is a different item.
    expect(rewriteReferences(actor, local, 'Actor.b').count).toBe(0);
  });

  it('touches only text when asked for links only', () => {
    const cls = {
      system: {
        description: { value: 'Learn @UUID[Compendium.p.spells.Item.day]{Daylight}.' },
        advancement: {
          g1: { _id: 'g1', type: 'ItemGrant', configuration: { items: [{ uuid: DAY }] } },
        },
        activities: { k1: { type: 'cast', spell: { uuid: DAY } } },
      },
    };
    const r = rewriteReferences(cls, { ...swap, linksOnly: true });
    expect(r.update).toEqual({
      'system.description.value': `Learn @UUID[${BRI}]{Brilliance}.`,
    });
    expect(r.advancement).toBeNull();
  });

  it('rewrites a biography and leaves an unrelated document alone', () => {
    const actor = { system: { details: { biography: { value: 'Loves @UUID[Actor.a.Item.old]{Daylight}.' } } } };
    expect(rewriteReferences(actor, swap).update).toEqual({
      'system.details.biography.value': 'Loves @UUID[Actor.a.Item.new]{Brilliance}.',
    });
    const r = rewriteReferences({ name: 'Shield', system: { description: { value: 'Nothing.' } } }, swap);
    expect(r).toEqual({ update: {}, advancement: null, count: 0 });
  });
});

describe('previousValues', () => {
  it('records what an update overwrites, so it can be put back', () => {
    const raw = {
      system: {
        details: { biography: { value: 'a', public: 'b' } },
        activities: { k1: { spell: { uuid: 'X' } } },
      },
    };
    expect(
      previousValues(raw, {
        'system.details.biography.public': 'B',
        'system.activities.k1.spell.uuid': 'Y',
      }),
    ).toEqual({
      'system.details.biography.public': 'b',
      'system.activities.k1.spell.uuid': 'X',
    });
  });
});

describe('relative uuids', () => {
  it('resolves the forms Foundry writes, as foundry.utils.parseUuid does', () => {
    expect(resolveRelativeUuid('.Item.x', 'Actor.a')).toBe('Actor.a.Item.x');
    expect(resolveRelativeUuid('.x', 'Actor.a.Item.y')).toBe('Actor.a.Item.x');
    expect(resolveRelativeUuid('..Item.x', 'Actor.a.Item.y')).toBe('Actor.a.Item.x');
    expect(resolveRelativeUuid('.x', 'Actor.a')).toBe('Actor.x');
    expect(resolveRelativeUuid('.Item.x', 'Compendium.p.chars.Actor.a')).toBe(
      'Compendium.p.chars.Actor.a.Item.x',
    );
    expect(resolveRelativeUuid('Item.x', 'Actor.a')).toBe('Item.x');
  });

  it('builds them back as foundry.utils.buildRelativeUuid does', () => {
    expect(relativeUuid('Actor.a.Item.x', 'Actor.a')).toBe('.Item.x');
    expect(relativeUuid('Actor.a.Item.x', 'Actor.a.Item.y')).toBe('.x');
    expect(relativeUuid('Compendium.p.spells.Item.x', 'Actor.a')).toBe(
      'Compendium.p.spells.Item.x',
    );
  });
});

describe('remapActorReferences', () => {
  const activities = mapActivityIds(
    { system: { activities: { a1: { type: 'save', name: 'Burst' }, a2: { type: 'attack', name: 'Zap' } } } },
    { system: { activities: { n1: { type: 'save', name: 'Burst' } } } },
  );

  it('maps activities by type and name', () => {
    expect([...activities]).toEqual([['a1', 'n1']]);
  });

  it('rewrites system favorites and Tidy pins, and drops unmatched activities', () => {
    const actor = {
      system: {
        favorites: [
          { type: 'item', id: '.Item.old', sort: 1 },
          { type: 'item', id: '.Item.other', sort: 2 },
        ],
      },
      flags: {
        'tidy5e-sheet': {
          tabSheetPins: {
            actions: [
              { type: 'item', id: '.Item.old' },
              { type: 'activity', id: '.Item.old.Activity.a1' },
              { type: 'activity', id: '.Item.old.Activity.a2' },
            ],
          },
        },
      },
    };
    const r = remapActorReferences(actor, 'old', 'new', activities);
    expect(r.update['system.favorites']).toEqual([
      { type: 'item', id: '.Item.new', sort: 1 },
      { type: 'item', id: '.Item.other', sort: 2 },
    ]);
    expect(r.update['flags.tidy5e-sheet.tabSheetPins']).toEqual({
      actions: [
        { type: 'item', id: '.Item.new' },
        { type: 'activity', id: '.Item.new.Activity.n1' },
      ],
    });
    expect(r.changed).toBe(3);
    expect(r.dropped).toBe(1);
  });

  it('writes nothing when nothing points at the item', () => {
    const r = remapActorReferences(
      { system: { favorites: [{ id: '.Item.x' }] } },
      'old',
      'new',
      new Map(),
    );
    expect(r.update).toEqual({});
  });
});

describe('orderCandidates', () => {
  const doc = (uuid: string, source: string) => ({ uuid, source });

  it('puts the source match first and suggests it', () => {
    const ordered = orderCandidates(
      [doc('world', 'PHB'), doc('pack', 'SDS'), doc('other', '')],
      'SDS',
    );
    expect(ordered.map((c) => c.uuid)).toEqual(['pack', 'world', 'other']);
    expect(ordered.map((c) => c.suggested)).toEqual([true, false, false]);
  });

  it('suggests a lone candidate, and nothing when it cannot tell', () => {
    expect(orderCandidates([doc('only', 'PHB')], 'SDS')[0].suggested).toBe(
      true,
    );
    const unclear = orderCandidates([doc('a', 'PHB'), doc('b', 'XGE')], 'SDS');
    expect(unclear.map((c) => c.uuid)).toEqual(['a', 'b']);
    expect(unclear.some((c) => c.suggested)).toBe(false);
  });
});

describe('rules and picking', () => {
  it('keys a rule by normalized name and source', () => {
    expect(ruleKey({ originalName: 'Zariel’s Sword', originalSource: 'PHB' })).toBe(
      'zariels sword|phb',
    );
  });

  it('treats unreadable stored rules as none', () => {
    expect(parseRules('not json')).toEqual([]);
    expect(parseRules('[{"originalName":"A"},{}]')).toHaveLength(1);
  });

  it('picks the source match, else the only candidate, else gives up', () => {
    expect(pickBySource([{ source: 'PHB' }, { source: 'SDS' }], 'SDS')).toBe(1);
    expect(pickBySource([{ source: 'PHB' }], 'SDS')).toBe(0);
    expect(pickBySource([{ source: 'PHB' }, { source: 'DMG' }], 'SDS')).toBe(-1);
  });
});
