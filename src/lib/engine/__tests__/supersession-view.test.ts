/**
 * Tests for the Replacements view's engine: grouping both ways, the suggestion
 * diff, group replacement, and the N x M manual build.
 *
 * Fixtures mirror content-supersessions.json as it actually is: 104 of its 278
 * rows are PHB/XPHB pairs pointing at one homebrew spell, one group has four
 * originals, and exactly three rows carry more than one target.
 */
import { describe, it, expect } from 'vitest';
import {
  groupByReplacementSet,
  groupByReplacement,
  groupRowKeys,
} from '../supersession/group.ts';
import {
  diffSuggestions,
  suggestionId,
  suggestionPairKey,
} from '../supersession/suggest.ts';
import { removeGroup, replaceGroup } from '../supersession/edit.ts';
import { scanMarkers } from '../supersession/scan.ts';
import { buildManualRows } from '../supersession/build-row.ts';
import { rowKey } from '../supersession/document.ts';
import type { SupersessionRow } from '../supersession/types.ts';

const target = (uid: string) => ({
  page: 'spells.html',
  prop: 'spell',
  uid,
});

const row = (
  displayName: string,
  source: string,
  uids: string[],
): SupersessionRow => ({
  displayName,
  source,
  page: 'spells.html',
  hash: `${displayName.toLowerCase().replace(/ /g, '%20')}_${source.toLowerCase()}`,
  prop: 'spell',
  replacedBy: uids.map(target),
});

const ALTER_PHB = row('Alter Self', 'PHB', ['Adaptation|SpellsThatDontSuck']);
const ALTER_XPHB = row('Alter Self', 'XPHB', ['Adaptation|SpellsThatDontSuck']);
const FRIEND_PHB = row('Animal Friendship', 'PHB', [
  'Befriend Beast|SpellsThatDontSuck',
]);
const MESSENGER_PHB = row('Animal Messenger', 'PHB', [
  'Befriend Beast|SpellsThatDontSuck',
]);
const SPLIT = row('Phantasmal Force', 'PHB', [
  'Hallucination|SpellsThatDontSuck',
  'Phantasm|SpellsThatDontSuck',
]);

describe('groupByReplacementSet', () => {
  it('collapses rows sharing one replacement into a single group', () => {
    const groups = groupByReplacementSet([ALTER_PHB, ALTER_XPHB]);
    expect(groups).toHaveLength(1);
    expect(groups[0].originals.map((r) => r.source)).toEqual(['PHB', 'XPHB']);
    expect(groups[0].replacements.map((t) => t.uid)).toEqual([
      'Adaptation|SpellsThatDontSuck',
    ]);
  });

  it('keeps distinct replacements in distinct groups', () => {
    const groups = groupByReplacementSet([ALTER_PHB, FRIEND_PHB]);
    expect(groups).toHaveLength(2);
  });

  it('groups two different spells that share one replacement', () => {
    const groups = groupByReplacementSet([FRIEND_PHB, MESSENGER_PHB]);
    expect(groups).toHaveLength(1);
    expect(groups[0].originals).toHaveLength(2);
  });

  it('treats a differing target set as its own group', () => {
    const groups = groupByReplacementSet([ALTER_PHB, SPLIT]);
    expect(groups).toHaveLength(2);
  });

  it('ignores target order when keying', () => {
    const reversed = row('Phantasmal Force', 'XPHB', [
      'Phantasm|SpellsThatDontSuck',
      'Hallucination|SpellsThatDontSuck',
    ]);
    expect(groupByReplacementSet([SPLIT, reversed])).toHaveLength(1);
  });

  it('is deterministic in output order', () => {
    const a = groupByReplacementSet([FRIEND_PHB, ALTER_PHB]);
    const b = groupByReplacementSet([ALTER_PHB, FRIEND_PHB]);
    expect(a.map((g) => g.key)).toEqual(b.map((g) => g.key));
  });
});

describe('groupByReplacement', () => {
  it('makes one group per distinct replacement', () => {
    const groups = groupByReplacement([ALTER_PHB, ALTER_XPHB, FRIEND_PHB]);
    expect(groups.map((g) => g.replacements[0].uid)).toEqual([
      'Adaptation|SpellsThatDontSuck',
      'Befriend Beast|SpellsThatDontSuck',
    ]);
  });

  it('lists a split row under each of its targets', () => {
    const groups = groupByReplacement([SPLIT]);
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(g.originals).toHaveLength(1);
  });
});

describe('groupRowKeys', () => {
  it('returns the row key of every original in the group', () => {
    const [group] = groupByReplacementSet([ALTER_PHB, ALTER_XPHB]);
    expect(groupRowKeys(group)).toEqual([
      rowKey(ALTER_PHB),
      rowKey(ALTER_XPHB),
    ]);
  });
});

describe('diffSuggestions', () => {
  it('suggests a candidate with no existing row', () => {
    const out = diffSuggestions([ALTER_PHB], []);
    expect(out).toHaveLength(1);
    expect(out[0].missing.map((t) => t.uid)).toEqual([
      'Adaptation|SpellsThatDontSuck',
    ]);
  });

  it('drops a candidate whose exact pair is already mapped', () => {
    expect(diffSuggestions([ALTER_PHB], [ALTER_PHB])).toEqual([]);
  });

  it('suggests only the missing target when the original is mapped elsewhere', () => {
    const existing = row('Alter Self', 'PHB', ['Something Else|Other']);
    const out = diffSuggestions([ALTER_PHB], [existing]);
    expect(out).toHaveLength(1);
    expect(out[0].missing.map((t) => t.uid)).toEqual([
      'Adaptation|SpellsThatDontSuck',
    ]);
  });
});

describe('suggestion identity', () => {
  it('separates two homebrews claiming the same original', () => {
    const a = { row: ALTER_PHB, missing: ALTER_PHB.replacedBy };
    const b = {
      row: row('Alter Self', 'PHB', ['Other Thing|Brew']),
      missing: [target('Other Thing|Brew')],
    };
    expect(suggestionId(a)).not.toBe(suggestionId(b));
  });

  it('is stable when half a split is dismissed', () => {
    expect(suggestionId({ row: SPLIT, missing: SPLIT.replacedBy })).toBe(
      suggestionId({ row: SPLIT, missing: [SPLIT.replacedBy[0]] }),
    );
  });

  it('keys a dismissal to one original-target pair', () => {
    expect(suggestionPairKey(SPLIT, SPLIT.replacedBy[1])).toBe(
      `${rowKey(SPLIT)}|Phantasm|SpellsThatDontSuck`,
    );
    expect(suggestionPairKey(SPLIT, SPLIT.replacedBy[0])).not.toBe(
      suggestionPairKey(SPLIT, SPLIT.replacedBy[1]),
    );
  });
});

describe('removeGroup', () => {
  // The default view: the group carries each original's whole target set, so
  // Delete takes the rows.
  it('drops whole rows when no target is named', () => {
    const [group] = groupByReplacementSet([ALTER_PHB, ALTER_XPHB, SPLIT]);
    const out = removeGroup(
      [ALTER_PHB, ALTER_XPHB, SPLIT],
      groupRowKeys(group),
    );
    expect(out.map(rowKey)).toEqual([rowKey(SPLIT)]);
  });

  it('drops a split outright, both targets with it', () => {
    const out = removeGroup([ALTER_PHB, SPLIT], [rowKey(SPLIT)]);
    expect(out.map(rowKey)).toEqual([rowKey(ALTER_PHB)]);
  });

  // The swapped view: a multi-target row appears under EACH of its targets, so
  // deleting one of those groups must leave the row's other mappings alone.
  it('drops only the named target, keeping the other targets', () => {
    const groups = groupByReplacement([SPLIT]);
    const hallucination = groups.find(
      (g) => g.key === 'Hallucination|SpellsThatDontSuck',
    )!;
    const out = removeGroup(
      [ALTER_PHB, SPLIT],
      groupRowKeys(hallucination),
      hallucination.replacements[0].uid,
    );
    const kept = out.find((r) => rowKey(r) === rowKey(SPLIT));
    expect(kept?.replacedBy.map((t) => t.uid)).toEqual([
      'Phantasm|SpellsThatDontSuck',
    ]);
    expect(out).toHaveLength(2);
  });

  it('removes a row whose last target goes', () => {
    const out = removeGroup(
      [ALTER_PHB, ALTER_XPHB],
      [rowKey(ALTER_PHB)],
      'Adaptation|SpellsThatDontSuck',
    );
    expect(out.map(rowKey)).toEqual([rowKey(ALTER_XPHB)]);
  });

  it('does not mutate the input array', () => {
    const rows = [ALTER_PHB, SPLIT];
    removeGroup(rows, [rowKey(SPLIT)]);
    removeGroup(rows, [rowKey(SPLIT)], 'Hallucination|SpellsThatDontSuck');
    expect(rows).toHaveLength(2);
    expect(SPLIT.replacedBy).toHaveLength(2);
  });
});

describe('replaceGroup', () => {
  it('removes the named rows before merging the incoming ones', () => {
    const incoming = [row('Alter Self', 'PHB', ['New Thing|Brew'])];
    const out = replaceGroup(
      [ALTER_PHB, ALTER_XPHB],
      [rowKey(ALTER_XPHB)],
      incoming,
    );
    const keys = out.rows.map(rowKey);
    expect(keys).not.toContain(rowKey(ALTER_XPHB));
    expect(out.rows.find((r) => rowKey(r) === rowKey(ALTER_PHB))).toBeTruthy();
  });

  it('lets an edited row drop a target rather than merging it back', () => {
    const trimmed = row('Phantasmal Force', 'PHB', [
      'Hallucination|SpellsThatDontSuck',
    ]);
    const out = replaceGroup([SPLIT], [rowKey(SPLIT)], [trimmed]);
    expect(out.rows[0].replacedBy.map((t) => t.uid)).toEqual([
      'Hallucination|SpellsThatDontSuck',
    ]);
  });

  it('does not mutate the input array', () => {
    const rows = [ALTER_PHB, ALTER_XPHB];
    replaceGroup(rows, [rowKey(ALTER_PHB)], []);
    expect(rows).toHaveLength(2);
  });
});

describe('scanMarkers', () => {
  const known = () => true;
  const record = (name: string, marker: string, reason: string | null) => ({
    prop: 'spell',
    source: 'SpellsThatDontSuck',
    name,
    hash: `${name.toLowerCase()}_spellsthatdontsuck`,
    parse: {
      marker,
      targets: marker ? [{ tag: 'spell', name: 'Shield', source: 'PHB' }] : [],
      reason,
    },
  });

  it('skips entities that carry no marker at all', () => {
    const out = scanMarkers(
      [record('Arcane Wall', '', 'no "Replaces:" marker')],
      known,
    );
    expect(out.candidates).toEqual([]);
    expect(out.review).toEqual([]);
    expect(out.scanned).toBe(0);
  });

  it('builds a candidate row from a clean marker', () => {
    const out = scanMarkers(
      [record('Deflection', '{@spell Shield|PHB}', null)],
      known,
    );
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].displayName).toBe('Shield');
    expect(out.candidates[0].replacedBy[0].uid).toBe(
      'Deflection|SpellsThatDontSuck',
    );
  });

  it('sends a qualified marker to review instead of mapping it', () => {
    const out = scanMarkers(
      [
        record(
          'Beast Perception',
          '{@spell Beast Sense|PHB} (in part)',
          'qualified "(in part)": "{@spell Beast Sense|PHB} (in part)"',
        ),
      ],
      known,
    );
    expect(out.candidates).toEqual([]);
    expect(out.review).toHaveLength(1);
    expect(out.review[0].replacement).toBe(
      'Beast Perception|SpellsThatDontSuck',
    );
  });

  it('reviews a clean marker whose target is not in the corpus', () => {
    const out = scanMarkers(
      [record('Deflection', '{@spell Shield|PHB}', null)],
      () => false,
    );
    expect(out.candidates).toEqual([]);
    expect(out.review).toHaveLength(1);
    expect(out.review[0].reason).toContain('not in the corpus');
  });
});

describe('buildManualRows', () => {
  const original = { name: 'Guidance', source: 'PHB', prop: 'spell' };
  const original2 = { name: 'Guidance', source: 'XPHB', prop: 'spell' };
  const rep = { name: 'Benediction', source: 'SDS', prop: 'spell' };
  const rep2 = { name: 'Other Spell', source: 'HB', prop: 'spell' };

  it('builds one row per original carrying every replacement', () => {
    const out = buildManualRows([original, original2], [rep, rep2]);
    expect(out).toHaveLength(2);
    for (const r of out) {
      expect(r.replacedBy.map((t) => t.uid)).toEqual([
        'Benediction|SDS',
        'Other Spell|HB',
      ]);
    }
  });

  it('keeps the first replacement primary', () => {
    const [built] = buildManualRows([original], [rep, rep2]);
    expect(built.replacedBy[0].uid).toBe('Benediction|SDS');
  });

  it('de-duplicates a replacement listed twice', () => {
    const [built] = buildManualRows([original], [rep, { ...rep }]);
    expect(built.replacedBy).toHaveLength(1);
  });

  it('throws when either side is empty', () => {
    expect(() => buildManualRows([], [rep])).toThrow();
    expect(() => buildManualRows([original], [])).toThrow();
  });
});
