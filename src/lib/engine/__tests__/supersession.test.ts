/**
 * Tests for engine/supersession/* - marker parsing, row building, round-trip.
 *
 * The markers and hashes here are REAL, lifted from Spells That Don't Suck and
 * from the `_review` block of a working mapping file. Testing against real
 * data, not the implementation, is what catches a marker being classified
 * differently from how the file already records it.
 */
import { describe, it, expect } from 'vitest';
import { parseReplacesMarker } from '../supersession/parse-marker.ts';
import {
  toSupersessionHash,
  hashForEntity,
  packUid,
  unpackUid,
} from '../supersession/hash.ts';
import {
  propToPage,
  isSupersedableProp,
  arePropsCompatible,
} from '../supersession/prop-page.ts';
import {
  buildManualRow,
  buildRowsFromMarker,
  propForTag,
  SupersessionBuildError,
} from '../supersession/build-row.ts';
import {
  parseSupersessionDocument,
  serializeSupersessionDocument,
  stringifySupersessionFile,
  mergeRows,
  removeRow,
  removeTarget,
  rowKey,
  emptySupersessionEnvelope,
} from '../supersession/document.ts';

const spell = (entries: unknown[]) => ({ entries });
const SDS = 'SpellsThatDontSuck';

describe('marker parsing', () => {
  it('accepts a clean one-to-one marker', () => {
    const out = parseReplacesMarker(
      spell(['{@b Replaces:} {@spell Shield|PHB}']),
      { ownSource: SDS },
    );
    expect(out.reason).toBeNull();
    expect(out.targets).toEqual([
      { tag: 'spell', name: 'Shield', source: 'PHB' },
    ]);
  });

  it('accepts "A and B" as two originals for one replacement', () => {
    const out = parseReplacesMarker(
      spell(['{@b Replaces:} {@spell Bane|PHB} and {@spell Bless|PHB}']),
      { ownSource: SDS },
    );
    expect(out.reason).toBeNull();
    expect(out.targets.map((t) => t.name)).toEqual(['Bane', 'Bless']);
  });

  it('sends a qualified "(in part)" marker to review', () => {
    const out = parseReplacesMarker(
      spell(['{@b Replaces:} {@spell Negative Energy Flood|XGE} (in part)']),
      { ownSource: SDS },
    );
    expect(out.reason).toContain('(in part)');
    expect(out.targets).toHaveLength(1);
  });

  it('sends a conditional "(with X)" marker to review', () => {
    const out = parseReplacesMarker(
      spell([
        '{@b Replaces:} {@spell Ray of Sickness|PHB} (with {@spell Minor Drain|SpellsThatDontSuck})',
      ]),
      { ownSource: SDS },
    );
    expect(out.reason).toContain('conditional');
  });

  it('sends a self-referential marker to review', () => {
    const out = parseReplacesMarker(
      spell([`{@b Replaces:} {@spell Minor Drain|${SDS}}`]),
      { ownSource: SDS },
    );
    expect(out.reason).toContain('its own source');
  });

  it('sends a source-less tag to review', () => {
    const out = parseReplacesMarker(spell(['{@b Replaces:} {@spell Shield}']), {
      ownSource: SDS,
    });
    expect(out.reason).toContain('tag without a source');
  });

  it('reports a missing marker and a body with no text', () => {
    expect(
      parseReplacesMarker(spell(['A plain description.']), { ownSource: SDS })
        .reason,
    ).toBe('no "Replaces:" marker');
    expect(parseReplacesMarker(spell([]), { ownSource: SDS }).reason).toBe(
      'no text entry',
    );
    expect(parseReplacesMarker({}, { ownSource: SDS }).reason).toBe(
      'no text entry',
    );
  });

  it('reads only the first string entry', () => {
    const out = parseReplacesMarker(
      spell([
        { type: 'entries', entries: [] },
        'Not a marker.',
        '{@b Replaces:} {@spell Shield|PHB}',
      ]),
      { ownSource: SDS },
    );
    expect(out.reason).toBe('no "Replaces:" marker');
  });

  it('trims trailing punctuation off the marker text', () => {
    const out = parseReplacesMarker(
      spell(['{@b Replaces:} {@spell Shield|PHB}.']),
      { ownSource: SDS },
    );
    expect(out.marker).toBe('{@spell Shield|PHB}');
  });
});

describe('hashes and uids', () => {
  it('matches real hashes from the mapping file', () => {
    expect(toSupersessionHash('Shield', 'PHB')).toBe('shield_phb');
    expect(toSupersessionHash("Abi-Dalzim's Horrid Wilting", 'XGE')).toBe(
      "abi-dalzim's%20horrid%20wilting_xge",
    );
    expect(toSupersessionHash('Absorb Elements', 'XGE')).toBe(
      'absorb%20elements_xge',
    );
  });

  it('uses the blocklist builders for props whose hash is not name_source', () => {
    expect(
      hashForEntity({ name: 'Shield', source: 'PHB', prop: 'spell' }),
    ).toBe('shield_phb');
    expect(
      hashForEntity({ name: 'Longsword', source: 'PHB', prop: 'baseitem' }),
    ).toBe('longsword_phb');
  });

  it('round-trips a uid, and reports a source-less one', () => {
    expect(packUid('Deflection', SDS)).toBe(`Deflection|${SDS}`);
    expect(unpackUid(`Deflection|${SDS}`)).toEqual({
      name: 'Deflection',
      source: SDS,
    });
    expect(unpackUid('Deflection')).toEqual({ name: 'Deflection', source: '' });
  });
});

describe('prop to page', () => {
  it('resolves the pages the runtime knows', () => {
    expect(propToPage('spell')).toBe('spells.html');
    expect(propToPage('baseitem')).toBe('items.html');
    expect(propToPage('monster')).toBe('bestiary.html');
  });

  it('reports props with no list page as unsupersedable', () => {
    expect(propToPage('legendaryGroup')).toBeNull();
    expect(isSupersedableProp('legendaryGroup')).toBe(false);
    expect(isSupersedableProp('spell')).toBe(true);
  });

  it('allows a cross-prop mapping only within one page', () => {
    expect(arePropsCompatible('item', 'baseitem')).toBe(true);
    expect(arePropsCompatible('item', 'monster')).toBe(false);
    expect(arePropsCompatible('skill', 'skill')).toBe(false);
  });
});

describe('building rows', () => {
  const deflection = { name: 'Deflection', source: SDS, prop: 'spell' };

  it('builds the row shape the runtime reads', () => {
    const [row] = buildRowsFromMarker(deflection, [
      { tag: 'spell', name: 'Shield', source: 'PHB' },
    ]);
    expect(row).toEqual({
      displayName: 'Shield',
      source: 'PHB',
      page: 'spells.html',
      hash: 'shield_phb',
      prop: 'spell',
      replacedBy: [
        { page: 'spells.html', prop: 'spell', uid: `Deflection|${SDS}` },
      ],
    });
  });

  it('points a hand-made pair at the replacement page', () => {
    const row = buildManualRow(
      { name: 'Longsword', source: 'PHB', prop: 'baseitem' },
      { name: 'Longsword', source: 'MyHomebrewItems', prop: 'item' },
    );
    expect(row.replacedBy[0].prop).toBe('item');
    expect(row.replacedBy[0].page).toBe('items.html');
  });

  it('reads the original prop off the marker tag', () => {
    expect(propForTag('creature', 'spell')).toBe('monster');
    expect(propForTag('optfeature', 'spell')).toBe('optionalfeature');
    expect(propForTag('nonsense', 'spell')).toBe('spell');
  });

  it('refuses a prop with no list page, and an incomplete pick', () => {
    expect(() =>
      buildManualRow(
        { name: 'Anything', source: 'PHB', prop: 'legendaryGroup' },
        deflection,
      ),
    ).toThrow(SupersessionBuildError);
    expect(() =>
      buildManualRow({ name: 'Shield', source: '', prop: 'spell' }, deflection),
    ).toThrow(SupersessionBuildError);
  });
});

describe('the document', () => {
  const file = {
    _readme: ['keep me'],
    supersession: [
      {
        manual: false,
        displayName: 'Shield',
        source: 'PHB',
        page: 'spells.html',
        hash: 'shield_phb',
        prop: 'spell',
        replacedBy: {
          page: 'spells.html',
          prop: 'spell',
          uid: `Deflection|${SDS}`,
        },
      },
    ],
    _review: [
      {
        replacement: `Touch of Filth|${SDS}`,
        reason: 'conditional',
        targets: ['Ray of Sickness|PHB'],
      },
    ],
  };

  it('normalises a lone replacedBy object into a list', () => {
    const doc = parseSupersessionDocument(file);
    expect(doc.rows[0].replacedBy).toHaveLength(1);
    expect(doc.review[0].targets).toEqual(['Ray of Sickness|PHB']);
    expect(doc.envelope._readme).toEqual(['keep me']);
  });

  it('drops the old generator flags and readme on save', () => {
    const doc = parseSupersessionDocument({
      _readme: ['old'],
      supersession: [{ ...file.supersession[0], origin: 'sds' }],
    });
    const out = serializeSupersessionDocument(doc);
    expect(out.supersession[0]).not.toHaveProperty('manual');
    expect(out.supersession[0]).not.toHaveProperty('origin');
    expect((out as Record<string, unknown>)._readme).toEqual(emptySupersessionEnvelope()._readme);
  });

  it('merges two rows on one original into a split, keeping the first primary', () => {
    const doc = parseSupersessionDocument({
      supersession: [
        {
          page: 'spells.html',
          hash: 'phantasmal%20force_phb',
          prop: 'spell',
          replacedBy: { uid: `Hallucination|${SDS}` },
        },
        {
          page: 'spells.html',
          hash: 'phantasmal%20force_phb',
          prop: 'spell',
          replacedBy: { uid: `Phantasm|${SDS}` },
        },
      ],
    });
    expect(doc.rows).toHaveLength(1);
    expect(doc.duplicatesMerged).toBe(1);
    expect(doc.rows[0].replacedBy.map((it) => it.uid)).toEqual([
      `Hallucination|${SDS}`,
      `Phantasm|${SDS}`,
    ]);
    // A target that omits page/prop inherits the original's.
    expect(doc.rows[0].replacedBy[0].page).toBe('spells.html');
  });

  it('skips rows that could never fire, and rejects a foreign file', () => {
    const doc = parseSupersessionDocument({
      supersession: [
        { page: 'spells.html', hash: 'x_phb' },
        { page: 'spells.html', hash: 'y_phb', replacedBy: { uid: '' } },
        { hash: 'z_phb', replacedBy: { uid: 'A|B' } },
      ],
    });
    expect(doc.rows).toHaveLength(0);
    expect(() => parseSupersessionDocument({ blocklist: [] })).toThrow(
      /supersession/,
    );
  });

  it('round-trips without losing unknown fields', () => {
    const withNote = {
      ...file,
      supersession: [{ ...file.supersession[0], _note: 'collision' }],
    };
    const doc = parseSupersessionDocument(withNote);
    const out = serializeSupersessionDocument(doc) as Record<string, unknown>;
    expect((out as Record<string, unknown>)._readme).toEqual(emptySupersessionEnvelope()._readme);
    const rows = out.supersession as Record<string, unknown>[];
    expect(rows[0]._note).toBe('collision');
    // A single target collapses back to an object.
    expect(Array.isArray(rows[0].replacedBy)).toBe(false);
    expect(parseSupersessionDocument(out).rows).toEqual(doc.rows);
  });

  it('writes tab-indented JSON with a trailing newline', () => {
    const text = stringifySupersessionFile({ a: 1 });
    expect(text).toBe('{\n\t"a": 1\n}\n');
  });

  it('merges an incoming row as a split rather than replacing it', () => {
    const base = parseSupersessionDocument(file).rows;
    const incoming = buildRowsFromMarker(
      { name: 'Aegis', source: SDS, prop: 'spell' },
      [{ tag: 'spell', name: 'Shield', source: 'PHB' }],
    );
    const merged = mergeRows(base, incoming);
    expect(merged.rows).toHaveLength(1);
    expect(merged.added).toBe(0);
    expect(merged.merged).toBe(1);
    expect(merged.rows[0].replacedBy).toHaveLength(2);
    // The base list is untouched.
    expect(base[0].replacedBy).toHaveLength(1);

    const again = mergeRows(merged.rows, incoming);
    expect(again.merged).toBe(0);
    expect(again.unchanged).toBe(1);
  });

  it('removes a whole row, and one target of a split', () => {
    const rows = mergeRows(
      parseSupersessionDocument(file).rows,
      buildRowsFromMarker({ name: 'Aegis', source: SDS, prop: 'spell' }, [
        { tag: 'spell', name: 'Shield', source: 'PHB' },
      ]),
    ).rows;
    const key = rowKey(rows[0]);

    const trimmed = removeTarget(rows, key, `Deflection|${SDS}`);
    expect(trimmed[0].replacedBy.map((it) => it.uid)).toEqual([`Aegis|${SDS}`]);
    // Dropping the last target drops the row; a mapping with no target is inert.
    expect(removeTarget(trimmed, key, `Aegis|${SDS}`)).toHaveLength(0);
    expect(removeRow(rows, key)).toHaveLength(0);
  });
});
