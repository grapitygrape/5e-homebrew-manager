/**
 * Tests for engine/blocklist/* — hashes, file round-trip, diagnose/repair.
 *
 * The hash expectations are REAL hashes lifted from a working
 * content-blocklist.json, not derived from the implementation. That's the whole
 * point: a hash we invent is a rule that never fires.
 */
import { describe, it, expect } from 'vitest';
import {
  entityHash,
  encodeForHash,
  toUrlified,
  entitySource,
} from '../blocklist/hash.ts';
import {
  parseBlocklistDocument,
  serializeBlocklistDocument,
  entryKey,
  mergeEntries,
} from '../blocklist/entries.ts';
import { diagnoseBlocklist } from '../blocklist/diagnose.ts';
import type { ContentLookup, IndexedEntity } from '../blocklist/diagnose.ts';
import { isIndexableDataFile } from '../blocklist/catalog.ts';
import { flattenRaces, getSubraceName } from '../blocklist/races.ts';

describe('blocklist hashes', () => {
  it('builds the generic name_source hash', () => {
    expect(entityHash('race', { name: 'Astral Elf', source: 'AAG' })).toBe(
      'astral%20elf_aag',
    );
    expect(
      entityHash('feat', { name: 'Aberrant Dragonmark', source: 'ERLW' }),
    ).toBe('aberrant%20dragonmark_erlw');
  });

  it('leaves parentheses and apostrophes unencoded, but encodes : and ;', () => {
    // Real entry: gnome%20(forest%20variant%3a%20lorghalan)_chroniclesofeberron
    expect(
      entityHash('race', {
        name: 'Gnome (Forest Variant: Lorghalan)',
        source: 'ChroniclesOfEberron',
      }),
    ).toBe('gnome%20(forest%20variant%3a%20lorghalan)_chroniclesofeberron');
    expect(
      entityHash('race', {
        name: 'Half-Elf (Variant; Mark of Detection)',
        source: 'ERLW',
      }),
    ).toBe('half-elf%20(variant%3b%20mark%20of%20detection)_erlw');
    expect(toUrlified("Artisan's Guild Feature")).toBe(
      "artisan's%20guild%20feature",
    );
  });

  it('builds the class-feature hash with class and level', () => {
    // Real entry: artisan's%20guild%20feature_craftsman_vss_10_vss
    expect(
      entityHash('classFeature', {
        name: "Artisan's Guild Feature",
        className: 'Craftsman',
        classSource: 'VSS',
        level: 10,
        source: 'VSS',
      }),
    ).toBe("artisan's%20guild%20feature_craftsman_vss_10_vss");
  });

  it('builds the subclass-feature hash with subclass and level', () => {
    expect(
      entityHash('subclassFeature', {
        name: 'Bonus Proficiency',
        className: 'Cleric',
        classSource: 'PHB',
        subclassShortName: 'Life',
        subclassSource: 'PHB',
        level: 1,
        source: 'PHB',
      }),
    ).toBe('bonus%20proficiency_cleric_phb_life_phb_1_phb');
  });

  it('builds the subclass hash as a class page state part', () => {
    expect(
      entityHash('subclass', {
        name: 'Lore',
        shortName: 'Lore',
        className: 'Bard',
        classSource: 'PHB',
        source: 'PHB',
      }),
    ).toBe('bard_phb,state:sub_lore_phb=b1');
  });

  it('folds the parent race into a subrace hash', () => {
    expect(
      entityHash('subrace', { name: 'Hill', raceName: 'Dwarf', source: 'PHB' }),
    ).toBe('hill%20(dwarf)_phb');
  });

  it('uses id for books and adventures, and pantheon for deities', () => {
    expect(
      entityHash('book', {
        id: 'PHB',
        name: "Player's Handbook",
        source: 'PHB',
      }),
    ).toBe('phb');
    expect(
      entityHash('deity', {
        name: 'Bane',
        pantheon: 'Forgotten Realms',
        source: 'PHB',
      }),
    ).toBe('bane_forgotten%20realms_phb');
  });

  it('reads a generic variant source off inherits', () => {
    expect(entitySource({ inherits: { source: 'DMG' } })).toBe('DMG');
    expect(encodeForHash('a b', 'C')).toBe('a%20b_c');
  });
});

describe('blocklist file round-trip', () => {
  const file = {
    siteVersion: '2.30.1',
    fileType: 'content-blocklist',
    _meta: {
      sources: [{ json: 'blocklist', full: 'blocklist' }],
      dateAdded: 0,
    },
    blocklist: [
      {
        category: 'race',
        displayName: 'Astral Elf',
        hash: 'astral%20elf_aag',
        source: 'AAG',
        isAuto: false,
      },
      {
        displayName: '*',
        hash: '*',
        category: '*',
        source: 'AI',
        isAuto: true,
        note: 'keep me',
      },
      { hash: '', category: 'spell', source: 'PHB' }, // malformed → dropped
    ],
  };

  it('parses entries and preserves the envelope', () => {
    const doc = parseBlocklistDocument(file);
    expect(doc.entries).toHaveLength(2);
    expect(doc.envelope.siteVersion).toBe('2.30.1');
    expect(doc.envelope).not.toHaveProperty('blocklist');
    expect(doc.entries[1].isAuto).toBe(true);
    expect(doc.entries[1].extra).toEqual({ note: 'keep me' });
  });

  it('serializes back without losing envelope or unknown fields', () => {
    const out = serializeBlocklistDocument(parseBlocklistDocument(file));
    expect(out.siteVersion).toBe('2.30.1');
    expect(out._meta).toEqual(file._meta);
    const rules = out.blocklist as Record<string, unknown>[];
    expect(rules).toHaveLength(2);
    expect(rules[1].note).toBe('keep me');
    expect(rules[0]).toEqual(file.blocklist[0]);
  });

  it('collapses exact-duplicate rules', () => {
    // Observed in a real file: the same Aasimar/DMG/race rule written twice.
    const dupe = {
      fileType: 'content-blocklist',
      blocklist: [
        {
          displayName: 'Aasimar',
          hash: 'aasimar_dmg',
          category: 'race',
          source: 'DMG',
          isAuto: false,
        },
        {
          displayName: 'Aasimar',
          hash: 'aasimar_dmg',
          category: 'race',
          source: 'DMG',
          isAuto: false,
        },
        {
          displayName: 'Aasimar',
          hash: 'AASIMAR_DMG',
          category: 'Race',
          source: 'dmg',
          isAuto: false,
        },
      ],
    };
    const doc = parseBlocklistDocument(dupe);
    expect(doc.entries).toHaveLength(1);
    expect(doc.duplicatesRemoved).toBe(2);
  });

  it('rejects a non-blocklist payload', () => {
    expect(() =>
      parseBlocklistDocument({ fileType: 'items-sublist', items: [] }),
    ).toThrow(/Wrong file type/);
    expect(() => parseBlocklistDocument({ foo: 1 })).toThrow(
      /No "blocklist" array/,
    );
  });

  it('keys rules the way 5etools does, and merges without duplicating', () => {
    const a = {
      displayName: 'X',
      hash: 'x_phb',
      category: 'spell',
      source: 'PHB',
      isAuto: false,
    };
    expect(entryKey(a)).toBe('x_phb__spell__phb');
    const merged = mergeEntries(
      [a],
      [
        { ...a, displayName: 'different label' },
        { ...a, hash: 'y_phb' },
      ],
    );
    expect(merged.added).toBe(1);
    expect(merged.skipped).toBe(1);
  });
});

describe('diagnose + repair', () => {
  const corpus: IndexedEntity[] = [
    { prop: 'spell', source: 'PHB', hash: 'fireball_phb', name: 'Fireball' },
    {
      prop: 'item',
      source: 'PHB',
      hash: 'acid%20(vial)_phb',
      name: 'Acid (Vial)',
    },
    {
      prop: 'subrace',
      source: 'PHB',
      hash: 'hill%20(dwarf)_phb',
      name: 'Hill',
    },
    { prop: 'monster', source: 'MM', hash: 'goblin_mm', name: 'Goblin' },
    { prop: 'item', source: 'MM', hash: 'twin_mm', name: 'Twin' },
    { prop: 'spell', source: 'MM', hash: 'twin_mm', name: 'Twin' },
  ];
  const lookup: ContentLookup = {
    hasSource: (s) =>
      corpus.some((e) => e.source.toLowerCase() === s.toLowerCase()),
    find: (prop, hash) =>
      corpus.find((e) => e.prop === prop && e.hash === hash),
    findByName: (source, name) =>
      corpus.filter(
        (e) =>
          e.source.toLowerCase() === source.toLowerCase() &&
          e.name.toLowerCase() === name.toLowerCase(),
      ),
  };
  const entry = (o: Partial<Record<string, string>>) => ({
    displayName: o.displayName ?? '',
    hash: o.hash ?? '',
    category: o.category ?? '',
    source: o.source ?? '',
    isAuto: false,
  });

  it('passes a correct rule through untouched', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: 'fireball_phb', category: 'spell', source: 'PHB' })],
      lookup,
    );
    expect(r.diagnoses).toHaveLength(0);
    expect(r.repairedCount).toBe(0);
  });

  it('repairs a name-only hash by appending the source', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: 'fireball', category: 'spell', source: 'PHB' })],
      lookup,
    );
    expect(r.diagnoses[0].code).toBe('legacy-hash');
    expect(r.entries[0].hash).toBe('fireball_phb');
  });

  it('repairs an over-encoded hash', () => {
    const r = diagnoseBlocklist(
      [
        entry({
          hash: 'acid%20%28vial%29_phb',
          category: 'item',
          source: 'PHB',
        }),
      ],
      lookup,
    );
    expect(r.diagnoses[0].code).toBe('over-encoded-hash');
    expect(r.entries[0].hash).toBe('acid%20(vial)_phb');
  });

  it('repairs both at once', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: 'acid%20%28vial%29', category: 'item', source: 'PHB' })],
      lookup,
    );
    expect(r.entries[0].hash).toBe('acid%20(vial)_phb');
  });

  it('moves a rule filed under the parent page category', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: 'hill%20(dwarf)_phb', category: 'race', source: 'PHB' })],
      lookup,
    );
    expect(r.diagnoses[0].code).toBe('legacy-category');
    expect(r.entries[0].category).toBe('subrace');
  });

  it('flags an unknown source without touching the rule', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: '*', category: '*', source: 'NOPE' })],
      lookup,
    );
    expect(r.diagnoses[0].code).toBe('unknown-source');
    expect(r.entries[0].source).toBe('NOPE');
  });

  it('leaves an unresolvable rule alone and reports it', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: 'gone_phb', category: 'spell', source: 'PHB' })],
      lookup,
    );
    expect(r.diagnoses[0].level).toBe('error');
    expect(r.repairedCount).toBe(0);
  });

  it('refuses to guess when a name is ambiguous', () => {
    const r = diagnoseBlocklist(
      [
        entry({
          hash: 'nonsense',
          category: 'spell',
          source: 'MM',
          displayName: 'Twin',
        }),
      ],
      lookup,
    );
    expect(r.diagnoses[0].code).toBe('ambiguous');
    expect(r.entries[0].hash).toBe('nonsense');
  });

  it('collapses rules that a repair made identical, and says why', () => {
    // The real case: Custom Lineage listed as both `class` and `race` for TCE.
    // Repairing the bogus `class` rule lands it on the existing `race` rule.
    const r = diagnoseBlocklist(
      [
        entry({
          hash: 'fireball_phb',
          category: 'class',
          source: 'PHB',
          displayName: 'Fireball',
        }),
        entry({
          hash: 'fireball_phb',
          category: 'spell',
          source: 'PHB',
          displayName: 'Fireball',
        }),
      ],
      lookup,
    );
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].category).toBe('spell');
    expect(r.collapsed).toHaveLength(1);
    expect(r.collapsed[0]).toMatch(/became a duplicate once .* was repaired/);
  });

  it('keys diagnoses by rule identity, not position', () => {
    const r = diagnoseBlocklist(
      [
        entry({
          hash: 'fireball_phb',
          category: 'class',
          source: 'PHB',
          displayName: 'Fireball',
        }),
        entry({
          hash: 'fireball_phb',
          category: 'spell',
          source: 'PHB',
          displayName: 'Fireball',
        }),
        entry({ hash: 'gone_phb', category: 'spell', source: 'PHB' }),
      ],
      lookup,
    );
    const keys = r.entries.map(entryKey);
    // Every diagnosis names a row that exists...
    for (const d of r.diagnoses) expect(keys).toContain(d.key);
    // ...and the output is safe to use as a keyed list.
    expect(new Set(keys).size).toBe(keys.length);

    // The point of keying by identity: drop a row and the surviving rows keep
    // their own warnings instead of inheriting their neighbour's.
    const byKey = new Map(r.diagnoses.map((d) => [d.key, d]));
    const before = r.entries.map((e) => byKey.get(entryKey(e))?.code);
    const after = r.entries.slice(1).map((e) => byKey.get(entryKey(e))?.code);
    expect(after).toEqual(before.slice(1));
  });

  it('leaves wildcard rules for known sources alone', () => {
    const r = diagnoseBlocklist(
      [entry({ hash: '*', category: 'spell', source: 'PHB' })],
      lookup,
    );
    expect(r.diagnoses).toHaveLength(0);
  });
});

describe('race flattening', () => {
  it('merges subraces into "Race (Subrace)" and keeps the base race', () => {
    const flat = flattenRaces([
      {
        name: 'Gnome',
        source: 'PHB',
        subraces: [{ name: 'Forest' }, { name: 'Rock' }],
      },
    ]);
    expect(flat.map((r) => r.name)).toEqual([
      'Gnome',
      'Gnome (Forest)',
      'Gnome (Rock)',
    ]);
    // Real rule from a working blocklist: gnome%20(forest)_phb, category "race".
    expect(entityHash('race', flat[1])).toBe('gnome%20(forest)_phb');
  });

  it('renames the base race only when a subrace is unnamed', () => {
    const flat = flattenRaces([
      { name: 'Human', source: 'PHB', subraces: [{}, { name: 'Variant' }] },
    ]);
    expect(flat.map((r) => r.name)).toEqual([
      'Human (Base)',
      'Human',
      'Human (Variant)',
    ]);
    expect(entityHash('race', flat[0])).toBe('human%20(base)_phb');
  });

  it('takes the subrace source, not the race source', () => {
    // Dwarf is PHB, Duergar is MTF → dwarf%20(duergar)_mtf, exactly as blocked.
    const flat = flattenRaces([
      {
        name: 'Dwarf',
        source: 'PHB',
        subraces: [{ name: 'Duergar', source: 'MTF' }],
      },
    ]);
    expect(entityHash('race', flat[1])).toBe('dwarf%20(duergar)_mtf');
  });

  it('joins inside existing brackets rather than nesting them', () => {
    expect(getSubraceName('Half-Elf (Variant)', 'Mark of Detection')).toBe(
      'Half-Elf (Variant; Mark of Detection)',
    );
    expect(getSubraceName('Gnome', undefined)).toBe('Gnome');
  });

  it('adopts standalone subrace records into their declared parent', () => {
    const flat = flattenRaces(
      [{ name: 'Elf', source: 'PHB', subraces: [{ name: 'High' }] }],
      [
        { name: 'Eladrin', source: 'DMG', raceName: 'Elf', raceSource: 'PHB' },
        {
          name: 'Orphan',
          source: 'XXX',
          raceName: 'Nobody',
          raceSource: 'XXX',
        },
      ],
    );
    expect(flat.map((r) => r.name)).toEqual([
      'Elf',
      'Elf (High)',
      'Elf (Eladrin)',
    ]);
    // A subrace with no parent in the corpus is dropped, as 5etools would.
    expect(flat.some((r) => r.name.includes('Orphan'))).toBe(false);
  });

  it('leaves a race with no subraces alone', () => {
    expect(
      flattenRaces([{ name: 'Gnoll', source: 'ExploringEberron24' }]),
    ).toEqual([{ name: 'Gnoll', source: 'ExploringEberron24' }]);
  });
});

describe('index file filter', () => {
  it('skips fluff, foundry, indexes, and prose directories', () => {
    expect(isIndexableDataFile('items.json')).toBe(true);
    expect(isIndexableDataFile('bestiary/bestiary-mm.json')).toBe(true);
    expect(isIndexableDataFile('fluff-items.json')).toBe(false);
    expect(isIndexableDataFile('foundry-items.json')).toBe(false);
    expect(isIndexableDataFile('spells/index.json')).toBe(false);
    expect(isIndexableDataFile('adventure/adventure-lmop.json')).toBe(false);
    expect(isIndexableDataFile('book/book-phb.json')).toBe(false);
    expect(isIndexableDataFile('generated/gendata-tables.json')).toBe(false);
  });

  it('skips bare foundry.json, not just the foundry- prefix', () => {
    // These restate real entities as stubs (spells/foundry.json holds 295 XPHB
    // spells) AND sort before the real file, so first-wins indexing would keep
    // the stub. Matching only the prefix let 895 duplicates through.
    expect(isIndexableDataFile('spells/foundry.json')).toBe(false);
    expect(isIndexableDataFile('class/foundry.json')).toBe(false);
    expect(isIndexableDataFile('bestiary/foundry.json')).toBe(false);
    // …but the real data files next to them still count.
    expect(isIndexableDataFile('spells/spells-xphb.json')).toBe(true);
  });

  it('skips source-metadata sidecars', () => {
    expect(isIndexableDataFile('spells/sources.json')).toBe(false);
  });
});
