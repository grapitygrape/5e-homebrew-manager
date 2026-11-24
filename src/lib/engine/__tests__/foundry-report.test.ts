/**
 * The manager-side half of the Foundry check: which homebrew entries become
 * candidates, and how raw matches are judged. All pure — no bridge, no network.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCandidates,
  candidateCounts,
  metaSource,
  sourceNames,
  TYPE_MAP,
} from '../foundry/candidates.ts';
import {
  buildRow,
  buildReport,
  gapsFor,
  sourceAgrees,
  summarize,
  sortRows,
} from '../foundry/report.ts';
import type { Candidate, FoundryMatch } from '../foundry/types.ts';

const match = (over: Partial<FoundryMatch> = {}): FoundryMatch => ({
  uuid: 'Compendium.brew.items.Item.abc',
  name: 'Flame Tongue',
  docType: 'weapon',
  pack: 'brew.items',
  packLabel: 'Brew Items',
  matchKind: 'exact',
  score: 1,
  typeMatch: true,
  img: 'icons/weapons/sword.webp',
  hasImage: true,
  hasDescription: true,
  descriptionChars: 120,
  activityCount: 2,
  activityTypes: ['attack', 'damage'],
  source: 'BREW',
  sourceIds: ['BREW'],
  ...over,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'item:0',
  type: 'item',
  name: 'Flame Tongue',
  source: 'BREW',
  sourceNames: ['BREW'],
  docClass: 'Item',
  expect: [],
  ...over,
});

describe('buildCandidates', () => {
  const doc = {
    _meta: { sources: [{ json: 'BREW', full: 'Drakkenheim' }] },
    item: [{ name: 'Flame Tongue' }, { name: 'Bag of Nails', source: 'OTHER' }],
    spell: [{ name: 'Delerium Bolt' }],
    subclassFeature: [{ name: 'Warden of the Wastes' }],
    monster: [{ name: 'Delerium Horror' }],
    _copy: { name: 'ignored' },
  };

  it('picks up every checkable type, in TYPE_MAP order', () => {
    const c = buildCandidates(doc);
    expect(c.map((x) => x.name)).toEqual([
      'Flame Tongue',
      'Bag of Nails',
      'Delerium Bolt',
      'Warden of the Wastes',
    ]);
  });

  it('excludes monsters — Actors have no Activities to check', () => {
    expect(TYPE_MAP.monster).toBeUndefined();
    expect(buildCandidates(doc).some((c) => c.name === 'Delerium Horror')).toBe(
      false,
    );
  });

  it('falls back to the _meta source, and lets an entity override it', () => {
    const c = buildCandidates(doc);
    expect(c.find((x) => x.name === 'Flame Tongue')!.source).toBe('BREW');
    expect(c.find((x) => x.name === 'Bag of Nails')!.source).toBe('OTHER');
  });

  it('carries the expected Foundry subtype for spells and features', () => {
    const c = buildCandidates(doc);
    expect(c.find((x) => x.type === 'spell')!.expect).toEqual(['spell']);
    expect(c.find((x) => x.type === 'subclassFeature')!.expect).toEqual([
      'feat',
    ]);
    // Items may legitimately import as any dnd5e subtype.
    expect(c.find((x) => x.type === 'item')!.expect).toEqual([]);
  });

  it('gives every candidate a stable, unique id', () => {
    const ids = buildCandidates(doc).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('item:1');
  });

  it('skips nameless and non-object entries instead of guessing', () => {
    const c = buildCandidates({
      item: [{ name: '  ' }, null, 'nope', { name: 'Real' }],
    });
    expect(c.map((x) => x.name)).toEqual(['Real']);
    // Index survives the skips, so ids still point at the source array.
    expect(c[0].id).toBe('item:3');
  });

  it('handles a file with nothing checkable', () => {
    expect(buildCandidates({ monster: [{ name: 'x' }] })).toEqual([]);
    expect(buildCandidates({})).toEqual([]);
  });

  it('reads the meta source, tolerating its absence', () => {
    expect(metaSource(doc)).toBe('BREW');
    expect(metaSource({})).toBe('');
  });

  it('counts by type for the report header', () => {
    expect(candidateCounts(buildCandidates(doc))).toEqual({
      item: 2,
      spell: 1,
      subclassFeature: 1,
    });
  });
});

describe('gapsFor', () => {
  it('names each empty check', () => {
    expect(gapsFor(match())).toEqual([]);
    expect(gapsFor(match({ hasImage: false }))).toEqual(['image']);
    expect(
      gapsFor(
        match({ hasImage: false, hasDescription: false, activityCount: 0 }),
      ),
    ).toEqual(['image', 'description', 'activities']);
  });
});

describe('buildRow', () => {
  it('marks an unmatched entry missing', () => {
    const row = buildRow(candidate(), []);
    expect(row.status).toBe('missing');
    expect(row.best).toBeNull();
  });

  it('marks a complete exact match ok', () => {
    expect(buildRow(candidate(), [match()]).status).toBe('ok');
  });

  it('marks a match with an empty check incomplete', () => {
    const row = buildRow(candidate(), [match({ hasImage: false })]);
    expect(row.status).toBe('incomplete');
    expect(row.gaps).toEqual(['image']);
  });

  it('counts zero Activities as a gap', () => {
    const row = buildRow(candidate(), [
      match({ activityCount: 0, activityTypes: [] }),
    ]);
    expect(row.status).toBe('incomplete');
    expect(row.gaps).toEqual(['activities']);
  });

  it('treats a fuzzy-only match as ambiguous, even when it is complete', () => {
    const row = buildRow(candidate(), [
      match({ matchKind: 'fuzzy', score: 0.83, name: 'Flametounge' }),
    ]);
    expect(row.status).toBe('ambiguous');
    expect(row.note).toContain('Flametounge');
    expect(row.note).toContain('Brew Items');
    // The raw score is deliberately not quoted — token scoring reaches 1.0 on
    // names that read as different, and "100% similar" would look broken.
    expect(row.note).not.toContain('%');
  });

  it('treats several equally good matches as ambiguous', () => {
    const row = buildRow(candidate(), [
      match({ uuid: 'a', pack: 'p1' }),
      match({ uuid: 'b', pack: 'p2' }),
    ]);
    expect(row.status).toBe('ambiguous');
    expect(row.note).toContain('2 equally good');
  });

  it('flags a spell that imported as the wrong subtype', () => {
    const row = buildRow(candidate({ type: 'spell', expect: ['spell'] }), [
      match({ docType: 'feat', typeMatch: false }),
    ]);
    expect(row.status).toBe('ambiguous');
    expect(row.note).toContain('feat');
  });

  it('prefers the expected subtype over a same-score wrong one', () => {
    const row = buildRow(candidate({ type: 'spell', expect: ['spell'] }), [
      match({ uuid: 'wrong', docType: 'feat', typeMatch: false }),
      match({ uuid: 'right', docType: 'spell', typeMatch: true }),
    ]);
    expect(row.best!.uuid).toBe('right');
    expect(row.status).toBe('ok');
  });

  it('prefers exact over fuzzy, and the world copy over a compendium on a tie', () => {
    const row = buildRow(candidate(), [
      match({ uuid: 'fuzzy', matchKind: 'fuzzy', score: 0.9 }),
      match({ uuid: 'compendium' }),
      match({ uuid: 'world', pack: 'world', packLabel: 'World Items' }),
    ]);
    expect(row.best!.uuid).toBe('world');
    expect(row.matches[1].uuid).toBe('compendium');
    expect(row.matches[2].uuid).toBe('fuzzy');
  });
});

describe('summarize', () => {
  it('counts statuses and per-check gaps independently', () => {
    const rows = [
      buildRow(candidate({ id: 'a' }), [match()]),
      buildRow(candidate({ id: 'b' }), [
        match({ hasImage: false, activityCount: 0 }),
      ]),
      buildRow(candidate({ id: 'c' }), []),
    ];
    expect(summarize(rows)).toEqual({
      total: 3,
      ok: 1,
      incomplete: 1,
      ambiguous: 0,
      missing: 1,
      noImage: 1,
      noDescription: 0,
      noActivities: 1,
    });
  });
});

describe('buildReport', () => {
  const candidates = [
    candidate({ id: 'item:0' }),
    candidate({ id: 'item:1', name: 'Ghost Ink' }),
  ];

  it('turns candidates the bridge never answered for into missing rows', () => {
    const report = buildReport({
      file: 'brew.json',
      world: 'Drakkenheim',
      system: 'dnd5e',
      candidates,
      results: [{ id: 'item:0', matches: [match()] }],
      now: 1000,
    });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[1].status).toBe('missing');
    expect(report.summary).toMatchObject({ total: 2, ok: 1, missing: 1 });
    expect(report.generatedAt).toBe(1000);
  });

  it('keeps rows in candidate order; sortRows gives the worst-first view', () => {
    const report = buildReport({
      file: 'f.json',
      world: 'w',
      system: 'dnd5e',
      candidates,
      results: [{ id: 'item:0', matches: [match()] }],
    });
    expect(report.rows.map((r) => r.candidate.id)).toEqual([
      'item:0',
      'item:1',
    ]);
    expect(sortRows(report.rows).map((r) => r.status)).toEqual([
      'missing',
      'ok',
    ]);
  });
});

describe('sources', () => {
  // LLAART's Flash of Genius, against TCE's as Neptunium imports it.
  const llaart = candidate({
    name: 'Flash of Genius',
    type: 'classFeature',
    source: 'LLAART',
    sourceNames: ['LLAART', 'LLA:Art', 'Lazy Lich Artificer'],
    expect: ['feat'],
  });
  const tce = match({
    name: 'Flash of Genius',
    docType: 'feat',
    packLabel: 'Class Features',
    source: 'TCoE',
    sourceIds: ['TCE', 'TCoE'],
  });

  it('collects the json id, abbreviation and full title from _meta', () => {
    const doc = {
      _meta: {
        sources: [
          {
            json: 'LLAART',
            abbreviation: 'LLA:Art',
            full: 'Lazy Lich Artificer',
          },
        ],
      },
    };
    expect(sourceNames(doc, 'LLAART')).toEqual([
      'LLAART',
      'LLA:Art',
      'Lazy Lich Artificer',
    ]);
    expect(sourceNames(doc, 'OTHER')).toEqual(['OTHER']);
    expect(sourceNames(doc, '')).toEqual([]);
  });

  it('turns a same-named entry from another book into a missing row', () => {
    const row = buildRow(llaart, [tce]);
    expect(row.status).toBe('missing');
    expect(row.best).toBeNull();
    expect(row.gaps).toEqual([]);
    // Kept, so the report can show what was there instead.
    expect(row.matches[0].sourceMatch).toBe(false);
    expect(row.note).toContain('TCoE');
    expect(row.note).toContain('LLAART');
  });

  it('prefers the matching source over another book, whatever else ranks', () => {
    const ours = match({
      uuid: 'Item.ours',
      name: 'Flash of Genius',
      docType: 'feat',
      matchKind: 'normalized',
      pack: 'brew.features',
      source: 'LLA:Art',
      sourceIds: ['LLA:Art'],
      hasImage: false,
    });
    const row = buildRow(llaart, [{ ...tce, pack: 'world' }, ours]);
    expect(row.best?.uuid).toBe('Item.ours');
    expect(row.status).toBe('incomplete');
    expect(row.matches.map((m) => m.sourceMatch)).toEqual([true, false]);
  });

  it("reads Foundry's own book spellings as the 5etools source", () => {
    const tceEntry = candidate({ source: 'TCE', sourceNames: ['TCE'] });
    expect(
      sourceAgrees(tceEntry, match({ source: 'TCoE', sourceIds: ['TCoE'] })),
    ).toBe(true);
    expect(
      sourceAgrees(
        candidate({ source: 'XPHB', sourceNames: ['XPHB'] }),
        match({ source: 'PHB 2024', sourceIds: ['PHB 2024'] }),
      ),
    ).toBe(true);
  });

  it('neither credits nor blames a document that records no source', () => {
    const bare = match({ source: '', sourceIds: [] });
    expect(sourceAgrees(llaart, bare)).toBeNull();
    expect(buildRow(llaart, [{ ...bare, docType: 'feat' }]).status).toBe('ok');
  });

  it("falls back to `source` from modules that don't send sourceIds", () => {
    const old = match({ source: 'TCoE', sourceIds: undefined });
    expect(sourceAgrees(llaart, old)).toBe(false);
  });
});
