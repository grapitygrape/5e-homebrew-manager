/** Tests for engine/audit/brew-merge.ts — merging a model reply into a brew. */
import { describe, it, expect } from 'vitest';
import {
  parseModelReply,
  mergeIntoBrew,
  describeMerge,
} from '../audit/brew-merge.ts';

// Tab-indented like most brew files, with a quirk JSON.stringify wouldn't
// keep (the compact "classes" line), so a reserialise would show in the diff.
const brew = [
  '{',
  '\t"_meta": {',
  '\t\t"sources": [{ "json": "MyBrew", "abbreviation": "MB" }],',
  '\t\t"edition": "classic"',
  '\t},',
  '\t"spell": [',
  '\t\t{',
  '\t\t\t"name": "Ember Lash",',
  '\t\t\t"source": "MyBrew",',
  '\t\t\t"classes": {"fromClassList": [{"name": "Wizard", "source": "PHB"}]}',
  '\t\t},',
  '\t\t{',
  '\t\t\t"name": "Frost Step",',
  '\t\t\t"source": "MyBrew",',
  '\t\t\t"level": 1',
  '\t\t}',
  '\t]',
  '}',
  '',
].join('\n');

const reply = (o: unknown) => parseModelReply(JSON.stringify(o));

describe('parseModelReply', () => {
  it('reads a fenced block out of surrounding prose', () => {
    const r = parseModelReply(
      'Here you go:\n\n```json\n{"spell": [{"name": "A", "source": "MyBrew"}]}\n```\n\n1. Converted A.',
    );
    expect(r.props.spell.map((e) => e.name)).toEqual(['A']);
  });

  it('combines several blocks and ignores a quoted text block', () => {
    const r = parseModelReply(
      [
        '```text\nthe original\n```',
        '```json\n{"spell": [{"name": "A", "source": "MyBrew"}]}\n```',
        '```\n{"table": [{"name": "T", "source": "MyBrew"}]}\n```',
      ].join('\n'),
    );
    expect(Object.keys(r.props)).toEqual(['spell', 'table']);
  });

  it('takes an unfenced object with prose around it', () => {
    const r = parseModelReply(
      'Result: {"feat": [{"name": "Tough Hide", "source": "MyBrew"}]} done',
    );
    expect(r.props.feat[0].name).toBe('Tough Hide');
  });

  it("keeps a full file's _meta sources aside instead of merging them", () => {
    const r = reply({
      _meta: { sources: [{ json: 'Other' }] },
      spell: [{ name: 'A', source: 'Other' }],
    });
    expect(r.metaSources).toEqual(['Other']);
    expect(Object.keys(r.props)).toEqual(['spell']);
  });

  it('rejects a bare array, which has no property', () => {
    expect(() => reply([{ name: 'A' }])).toThrow(/bare array/);
  });

  it('says so when handed a single entry', () => {
    expect(() => reply({ name: 'A', source: 'MyBrew', entries: [] })).toThrow(
      /single entry/,
    );
  });

  it('reports invalid JSON in a block', () => {
    expect(() => parseModelReply('```json\n{"spell": [\n```')).toThrow(
      /code block isn't valid JSON/,
    );
  });
});

describe('mergeIntoBrew', () => {
  it('appends to an existing array without touching the rest of the file', () => {
    const r = mergeIntoBrew(
      brew,
      reply({ spell: [{ name: 'Stone Skin', source: 'MyBrew' }] }),
    );
    expect(r.added).toEqual([{ prop: 'spell', name: 'Stone Skin' }]);
    // The compact line survives: the file was spliced, not reserialised.
    expect(r.text).toContain(
      '"classes": {"fromClassList": [{"name": "Wizard", "source": "PHB"}]}',
    );
    expect(r.text).toContain(
      '\t\t},\n\t\t{\n\t\t\t"name": "Stone Skin",\n\t\t\t"source": "MyBrew"\n\t\t}\n\t]',
    );
    expect(
      JSON.parse(r.text).spell.map((s: { name: string }) => s.name),
    ).toEqual(['Ember Lash', 'Frost Step', 'Stone Skin']);
  });

  it('replaces an entry with the same name and source, in place', () => {
    const r = mergeIntoBrew(
      brew,
      reply({ spell: [{ name: 'frost step', source: 'MyBrew', level: 2 }] }),
    );
    expect(r.replaced).toEqual([{ prop: 'spell', name: 'frost step' }]);
    expect(r.added).toEqual([]);
    const spells = JSON.parse(r.text).spell;
    expect(spells).toHaveLength(2);
    expect(spells[1]).toEqual({
      name: 'frost step',
      source: 'MyBrew',
      level: 2,
    });
  });

  it('adds a missing property after the last one', () => {
    const r = mergeIntoBrew(
      brew,
      reply({ table: [{ name: 'Loot', source: 'MyBrew' }] }),
    );
    expect(r.text).toContain('\t],\n\t"table": [\n\t\t{\n\t\t\t"name": "Loot"');
    expect(JSON.parse(r.text).table).toHaveLength(1);
  });

  it('fills an empty array', () => {
    const raw = '{\n  "_meta": {},\n  "feat": []\n}\n';
    const r = mergeIntoBrew(raw, reply({ feat: [{ name: 'A', source: 'X' }] }));
    expect(r.text).toBe(
      '{\n  "_meta": {},\n  "feat": [\n    {\n      "name": "A",\n      "source": "X"\n    }\n  ]\n}\n',
    );
  });

  it('keeps CRLF line endings', () => {
    const raw = brew.replace(/\n/g, '\r\n');
    const r = mergeIntoBrew(
      raw,
      reply({ table: [{ name: 'T', source: 'MyBrew' }] }),
    );
    expect(r.text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('builds a new file with a placeholder _meta from an empty editor', () => {
    const r = mergeIntoBrew(
      '',
      reply({ spell: [{ name: 'A', source: 'UNKNOWN' }] }),
      1700000000,
    );
    expect(JSON.parse(r.text)).toEqual({
      _meta: {
        sources: [
          {
            json: 'UNKNOWN',
            abbreviation: 'UNK',
            full: 'Unknown',
            version: '1.0.0',
          },
        ],
        dateAdded: 1700000000,
        dateLastModified: 1700000000,
        edition: 'classic',
      },
      spell: [{ name: 'A', source: 'UNKNOWN' }],
    });
    expect(r.warnings[0]).toMatch(/placeholder for "UNKNOWN"/);
  });

  it("gives a new file the reply's own _meta when it sent one", () => {
    const meta = { sources: [{ json: 'MyBrew' }], edition: 'one' };
    const r = mergeIntoBrew(
      '',
      reply({ _meta: meta, spell: [{ name: 'A', source: 'MyBrew' }] }),
    );
    expect(JSON.parse(r.text)._meta).toEqual(meta);
  });

  it('warns about undeclared sources and foreign _meta, but still merges', () => {
    const r = mergeIntoBrew(
      brew,
      reply({
        _meta: { sources: [{ json: 'Other' }] },
        spell: [{ name: 'A', source: 'Other' }],
      }),
    );
    expect(r.added).toHaveLength(1);
    expect(r.warnings.join('\n')).toMatch(
      /source "Other", which this file's _meta/,
    );
    expect(r.warnings.join('\n')).toMatch(/reply's _meta declares "Other"/);
  });

  it('warns when the reply holds the same entry twice', () => {
    const r = mergeIntoBrew(
      brew,
      reply({
        spell: [
          { name: 'Twin', source: 'MyBrew' },
          { name: 'Twin', source: 'MyBrew' },
        ],
      }),
    );
    expect(r.added).toHaveLength(2);
    expect(r.warnings).toContain(
      'spell "Twin" is in the reply twice; both were added.',
    );
  });

  it('returns ascending edits that rebuild the same text', () => {
    const r = mergeIntoBrew(
      brew,
      reply({
        spell: [
          { name: 'Ember Lash', source: 'MyBrew', level: 3 },
          { name: 'New', source: 'MyBrew' },
        ],
        table: [{ name: 'T', source: 'MyBrew' }],
      }),
    );
    const froms = r.changes.map((c) => c.from);
    expect(froms).toEqual([...froms].sort((a, b) => a - b));
    let text = brew;
    for (const c of [...r.changes].reverse())
      text = text.slice(0, c.from) + c.insert + text.slice(c.to);
    expect(text).toBe(r.text);
  });

  it("refuses to merge into an editor that doesn't parse", () => {
    expect(() =>
      mergeIntoBrew('{ "spell": [', reply({ spell: [{ name: 'A' }] })),
    ).toThrow(/Fix the editor's JSON/);
  });

  it('describes what happened', () => {
    const r = mergeIntoBrew(
      brew,
      reply({
        spell: [
          { name: 'Frost Step', source: 'MyBrew' },
          { name: 'B', source: 'MyBrew' },
          { name: 'C', source: 'MyBrew' },
        ],
      }),
    );
    expect(describeMerge(r)).toBe('Added 2 entries, replaced 1 entry.');
  });
});

describe('mergeIntoBrew — _meta from the reply', () => {
  const kt = {
    _meta: { dependencies: { spell: ['KT-CLL'] } },
    subclass: [{ name: 'Machine God', source: 'MyBrew' }],
  };

  it("adds the reply's dependencies to the file's _meta", () => {
    const r = mergeIntoBrew(brew, reply(kt));
    const meta = JSON.parse(r.text)._meta;
    expect(meta.dependencies).toEqual({ spell: ['KT-CLL'] });
    expect(meta.sources).toEqual([{ json: 'MyBrew', abbreviation: 'MB' }]);
    expect(r.dependencies).toEqual(['spell: KT-CLL']);
    expect(describeMerge(r)).toBe(
      'Added 1 entry, added 1 dependency (spell: KT-CLL).',
    );
    // Entities are still spliced: the compact line elsewhere survives.
    expect(r.text).toContain('"classes": {"fromClassList"');
  });

  it("doesn't repeat a dependency the file already has", () => {
    const raw = brew.replace(
      '"edition": "classic"',
      '"edition": "classic",\n\t\t"dependencies": {"spell": ["kt-cll"]}',
    );
    const r = mergeIntoBrew(raw, reply(kt));
    expect(r.dependencies).toEqual([]);
    expect(r.text).toContain('"dependencies": {"spell": ["kt-cll"]}');
  });

  it('keeps edits apart when _meta is the last property', () => {
    const raw =
      '{\n\t"spell": [],\n\t"_meta": {"sources": [{"json": "MyBrew"}]}\n}\n';
    const r = mergeIntoBrew(
      raw,
      reply({ ...kt, table: [{ name: 'T', source: 'MyBrew' }] }),
    );
    for (let i = 1; i < r.changes.length; i++)
      expect(r.changes[i].from).toBeGreaterThan(r.changes[i - 1].to);
    expect(JSON.parse(r.text).table).toHaveLength(1);
  });

  it('warns when the reply was converted for another edition', () => {
    const r = mergeIntoBrew(
      brew,
      reply({
        _meta: { edition: 'one' },
        spell: [{ name: 'A', source: 'MyBrew' }],
      }),
    );
    expect(r.warnings.join('\n')).toMatch(
      /edition "one", but this file is "classic"/,
    );
    expect(JSON.parse(r.text)._meta.edition).toBe('classic');
  });

  it("gives a new file the reply's edition and dependencies", () => {
    const r = mergeIntoBrew(
      '',
      reply({
        _meta: { edition: 'one', dependencies: { spell: ['KT-CLL'] } },
        subclass: [{ name: 'Machine God', source: 'UNKNOWN' }],
      }),
    );
    const meta = JSON.parse(r.text)._meta;
    expect(meta.edition).toBe('one');
    expect(meta.dependencies).toEqual({ spell: ['KT-CLL'] });
    expect(meta.sources[0].json).toBe('UNKNOWN');
  });
});
