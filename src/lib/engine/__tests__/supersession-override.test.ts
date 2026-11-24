import { describe, expect, it } from 'vitest';
import {
  expandOverride,
  applyOverrides,
  findOverrideMatches,
  isOverrideRow,
  overrideConflicts,
  overrideId,
  parseOverrideRules,
  parseSupersessionDocument,
  serializeSupersessionDocument,
  stringifySupersessionFile,
} from '../supersession/index.ts';
import type { OverrideEntity, OverrideRule } from '../supersession/index.ts';

const spell = (name: string, source: string): OverrideEntity => ({
  prop: 'spell',
  source,
  name,
  hash: `${name}_${source}`.toLowerCase().replace(/ /g, '%20'),
});

const from = [spell('Manipulate Water', 'KT-CLL'), spell('Fireball', 'KT-CLL')];
const others = [
  spell('manipulate water', 'SDS'),
  spell('Manipulate Water', 'KCC'),
  spell('Fireball', 'PHB'),
  // The from source itself is never a target.
  spell('Fireball', 'KT-CLL'),
  // No counterpart in from.
  spell('Shield', 'SDS'),
];

describe('findOverrideMatches', () => {
  it('matches case-insensitively by name, grouped by source, excluding from', () => {
    const targets = findOverrideMatches('spell', 'KT-CLL', from, others);
    expect(targets.map((t) => t.source)).toEqual(['KCC', 'PHB', 'SDS']);
    const sds = targets.find((t) => t.source === 'SDS')!;
    expect(sds.matches).toHaveLength(1);
    expect(sds.matches[0].replacementUid).toBe('Manipulate Water|KT-CLL');
    expect(sds.matches[0].page).toBe('spells.html');
    expect(sds.matches[0].key).toBe(`spells.html|${sds.matches[0].hash}`);
  });

  it('ignores other props', () => {
    const feat = { ...spell('Fireball', 'X'), prop: 'feat' };
    expect(findOverrideMatches('spell', 'KT-CLL', from, [feat])).toEqual([]);
  });

  it('matches every hash when a target has the same name twice', () => {
    const twice = [
      spell('Fireball', 'SDS'),
      { ...spell('Fireball', 'SDS'), hash: 'fireball_sds_v2' },
    ];
    const targets = findOverrideMatches('spell', 'KT-CLL', from, twice);
    expect(targets[0].matches).toHaveLength(2);
  });
});

describe('expandOverride', () => {
  const targets = findOverrideMatches('spell', 'KT-CLL', from, others);
  const rule: OverrideRule = {
    id: overrideId('spell', 'KT-CLL'),
    prop: 'spell',
    from: 'KT-CLL',
    targets: ['SDS', 'KCC'],
    exclude: [],
  };

  it('builds one override-tagged row per selected match', () => {
    const rows = expandOverride(rule, targets, new Set());
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => isOverrideRow(r))).toBe(true);
    expect(rows[0].extra).toEqual({ override: 'spell:KT-CLL' });
    expect(rows[0].replacedBy).toEqual([
      { page: 'spells.html', prop: 'spell', uid: 'Manipulate Water|KT-CLL' },
    ]);
  });

  it('skips excluded keys', () => {
    const kcc = targets.find((t) => t.source === 'KCC')!.matches[0].key;
    expect(
      expandOverride({ ...rule, exclude: [kcc] }, targets, new Set()),
    ).toHaveLength(1);
  });

  it('lets a hand-written row win', () => {
    const sds = targets.find((t) => t.source === 'SDS')!.matches[0].key;
    expect(expandOverride(rule, targets, new Set([sds]))).toHaveLength(1);
  });

  it('expands nothing when the from source is gone', () => {
    expect(expandOverride(rule, [], new Set())).toEqual([]);
  });
});

describe('parseOverrideRules', () => {
  it('drops malformed rules and rebuilds ids', () => {
    const rules = parseOverrideRules([
      {
        id: 'stale',
        prop: 'spell',
        from: 'A',
        targets: ['B'],
        exclude: 'nope',
      },
      { prop: 'spell' },
      'junk',
    ]);
    expect(rules).toEqual([
      { id: 'spell:A', prop: 'spell', from: 'A', targets: ['B'], exclude: [] },
    ]);
  });
});

describe('overrideConflicts', () => {
  const a: OverrideRule = {
    id: 'spell:A',
    prop: 'spell',
    from: 'A',
    targets: ['B'],
    exclude: [],
  };
  const b: OverrideRule = {
    id: 'spell:B',
    prop: 'spell',
    from: 'B',
    targets: ['A'],
    exclude: [],
  };

  it('flags two rules overriding each other', () => {
    expect(overrideConflicts([a, b]).sort()).toEqual(['spell:A', 'spell:B']);
  });

  it('is quiet for a one-way rule', () => {
    expect(overrideConflicts([a])).toEqual([]);
  });
});

describe('document round-trip with overrides', () => {
  it('parses overrides out of the envelope and writes them back identically', () => {
    const file = {
      supersession: [
        {
          override: 'spell:A',
          displayName: 'X',
          source: 'B',
          page: 'spells.html',
          hash: 'x_b',
          prop: 'spell',
          replacedBy: { page: 'spells.html', prop: 'spell', uid: 'X|A' },
        },
      ],
      overrides: [
        {
          id: 'spell:A',
          prop: 'spell',
          from: 'A',
          targets: ['B'],
          exclude: [],
        },
      ],
      _review: [],
    };
    const doc = parseSupersessionDocument(file);
    expect(doc.overrides).toHaveLength(1);
    expect('overrides' in doc.envelope).toBe(false);
    expect(isOverrideRow(doc.rows[0])).toBe(true);
    const once = stringifySupersessionFile(serializeSupersessionDocument(doc));
    const twice = stringifySupersessionFile(
      serializeSupersessionDocument(
        parseSupersessionDocument(JSON.parse(once)),
      ),
    );
    expect(twice).toBe(once);
  });

  it('omits the key when there are no rules', () => {
    const doc = parseSupersessionDocument({ supersession: [], _review: [] });
    expect('overrides' in serializeSupersessionDocument(doc)).toBe(false);
  });
});

describe('applyOverrides', () => {
  const rule: OverrideRule = {
    id: 'spell:KT-CLL',
    prop: 'spell',
    from: 'KT-CLL',
    targets: ['SDS'],
    exclude: [],
  };
  const targets = findOverrideMatches('spell', 'KT-CLL', from, others);
  const sdsKey = targets.find((t) => t.source === 'SDS')!.matches[0].key;
  const [page, hash] = sdsKey.split('|');
  const hand = {
    displayName: 'Manipulate Water',
    source: 'SDS',
    page,
    hash,
    prop: 'spell',
    replacedBy: [{ page, prop: 'spell', uid: 'Other|X' }],
  };
  const stale = {
    ...hand,
    hash: 'gone_sds',
    extra: { override: 'spell:KT-CLL' },
  };

  it('drops stale rule rows and regenerates from the corpus', () => {
    const out = applyOverrides([stale], [rule], new Map([[rule.id, targets]]));
    expect(out.rows.map((r) => r.hash)).toEqual([hash]);
    expect(out.warnings).toEqual([]);
  });

  it('keeps hand rows and lets them win', () => {
    const out = applyOverrides([hand], [rule], new Map([[rule.id, targets]]));
    expect(out.rows).toEqual([hand]);
  });

  it('warns when a rule finds nothing to override', () => {
    const out = applyOverrides([], [rule], new Map());
    expect(out.rows).toEqual([]);
    expect(out.warnings[0]).toContain('KT-CLL');
  });

  it('warns about rules that override each other', () => {
    const back: OverrideRule = {
      id: 'spell:SDS',
      prop: 'spell',
      from: 'SDS',
      targets: ['KT-CLL'],
      exclude: [],
    };
    const out = applyOverrides([], [rule, back], new Map());
    expect(out.warnings.some((w) => w.includes('each other'))).toBe(true);
  });
});
