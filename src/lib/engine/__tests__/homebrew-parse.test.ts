/** Tests for engine/homebrew-parse.ts — validate + nest a homebrew file. */
import { describe, it, expect } from 'vitest';
import { buildEntityPositions } from '../audit/homebrew-parse.ts';
import {
  parseHomebrewFile,
  findEntityEnd,
  extractPropName,
} from '../audit/homebrew-parse.ts';
import {
  withNameSet,
  BARE_SCHEMA,
  type EntitySchema,
} from '../audit/validate.ts';

const itemSchema: EntitySchema = withNameSet({
  entityType: 'item',
  arrayProp: 'item',
  label: 'Item',
  required: ['name', 'source'],
  properties: [
    { name: 'name', type: 'string', description: '', required: true },
    { name: 'source', type: 'string', description: '', required: true },
  ],
});
const schemaFor = (type: string): EntitySchema =>
  type === 'item' ? itemSchema : BARE_SCHEMA;

const file: Record<string, unknown> = {
  _meta: { sources: [] }, // skipped
  class: [{ name: 'Fighter', source: 'PHB' }],
  classFeature: [
    { name: 'Second Wind', source: 'PHB', className: 'Fighter' },
    { name: 'Orphan', source: 'PHB', className: 'Wizard' }, // no Wizard class → stays a root
  ],
  item: [{ name: 'Sword', source: 'PHB' }, { name: 'Broken' }], // missing source → 1 error
};

describe('parseHomebrewFile', () => {
  const result = parseHomebrewFile(file, schemaFor);

  it('collects entity arrays in file order (skipping _meta)', () => {
    expect(result.types).toEqual(['class', 'classFeature', 'item']);
    expect(result.totals.objects).toBe(5);
    expect(result.totals.types).toBe(3);
  });

  it('nests a class feature under its class with depth', () => {
    const fighter = result.roots.find((n) => n.entity.name === 'Fighter')!;
    expect(fighter.children).toHaveLength(1);
    expect(fighter.children[0].entity.name).toBe('Second Wind');
    expect(fighter.children[0].depth).toBe(1);
  });

  it('leaves an unmatched feature as a root', () => {
    expect(result.roots.some((n) => n.entity.name === 'Orphan')).toBe(true);
  });

  it('counts validation errors and clean objects', () => {
    expect(result.totals.errors).toBe(1); // Broken item missing source
    expect(result.totals.clean).toBe(4);
  });
});

describe('findEntityEnd', () => {
  it('matches the closing brace, ignoring braces inside strings', () => {
    const text = '{"a":{"b":"}"},"c":1}';
    expect(findEntityEnd(text, 0)).toBe(text.length - 1);
  });
  it('returns -1 when unbalanced', () => {
    expect(findEntityEnd('{"a":1', 0)).toBe(-1);
  });
});

describe('extractPropName', () => {
  it('pulls the first <code> name from a message', () => {
    expect(
      extractPropName('Missing required property <code>source</code>.'),
    ).toBe('source');
    expect(extractPropName('no code here')).toBeNull();
  });
});

describe('parseHomebrewFile — magicvariant nesting', () => {
  const vf: Record<string, unknown> = {
    baseitem: [{ name: 'Longsword', source: 'PHB' }],
    item: [{ name: 'Staff', source: 'PHB' }],
    magicvariant: [
      {
        name: '+1 Longsword',
        source: 'Brew',
        inherits: { name: 'Longsword', source: 'PHB' },
      },
      {
        name: 'Staff of Foo',
        source: 'Brew',
        inherits: { name: 'Staff', source: 'PHB' },
      },
      { name: 'Any Weapon +1', source: 'Brew', requires: [{ weapon: true }] }, // no named base -> root
    ],
  };
  const result = parseHomebrewFile(vf, () => BARE_SCHEMA);

  it('nests a magicvariant under its baseitem via inherits', () => {
    const base = result.roots.find(
      (n) => n.type === 'baseitem' && n.entity.name === 'Longsword',
    )!;
    expect(base.children.map((c) => c.entity.name)).toContain('+1 Longsword');
    expect(base.children[0].depth).toBe(1);
  });

  it('nests a magicvariant under a plain item via inherits', () => {
    const itm = result.roots.find(
      (n) => n.type === 'item' && n.entity.name === 'Staff',
    )!;
    expect(itm.children.map((c) => c.entity.name)).toContain('Staff of Foo');
  });

  it('leaves a requires-only variant (no named base) as a root', () => {
    expect(result.roots.some((n) => n.entity.name === 'Any Weapon +1')).toBe(
      true,
    );
  });
});

describe('buildEntityPositions', () => {
  it('locates every entity — including unnamed ones — with exact brace ranges', () => {
    const doc = {
      _meta: { sources: [{ json: 'X' }] },
      item: [
        { name: 'A, with "quotes" and {braces}' },
        'not-an-object',
        { name: 'B' },
        [1, 2],
        { name: 'C' },
      ],
      bookData: [{ id: 'bk', data: [{ type: 'entries' }] }], // no `name` anywhere
    };
    const raw = JSON.stringify(doc, null, 2);
    const parsed = parseHomebrewFile(
      doc as Record<string, unknown>,
      () => BARE_SCHEMA,
    );
    const positions = buildEntityPositions(raw, parsed.nodes);

    // objects at item[0], item[2], item[4] + bookData[0] — non-objects consume
    // an index (matching parseHomebrewFile) but yield no position
    expect(positions).toHaveLength(4);
    for (const p of positions) {
      expect(raw[p.pos]).toBe('{');
      expect(raw[p.end]).toBe('}');
    }
    const itemC = positions.find(
      (p) => p.node.type === 'item' && p.node.entityIdx === 4,
    );
    expect(raw.slice(itemC!.pos, itemC!.end + 1)).toContain('"C"');
    const bk = positions.find((p) => p.node.type === 'bookData');
    expect(raw.slice(bk!.pos, bk!.end + 1)).toContain('"bk"');
  });
});
