/** Tests for engine/schema.ts — $ref resolution and top-level property collection. */
import { describe, it, expect } from 'vitest';
import {
  escapePointer,
  unescapePointer,
  walkPointer,
  parseSchemaRef,
  resolveRef,
  collectTopLevelProperties,
  getEntityProperties,
  getEntityBranches,
  type SchemaMap,
} from '../audit/schema.ts';

const schemas: SchemaMap = {
  'base.json': {
    $defs: {
      common: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name' },
          source: { type: 'string', description: 'Source  book' },
        },
        required: ['name', 'source'],
      },
    },
  },
  'items.json': {
    $defs: {
      item: {
        type: 'object',
        allOf: [{ $ref: 'base.json#/$defs/common' }],
        properties: {
          value: { type: 'integer', description: 'Cost in cp' },
          rarity: { type: 'string' },
        },
        required: ['rarity'],
      },
    },
  },
};

describe('shared JSON-Pointer and $ref helpers', () => {
  it('escapes and unescapes RFC 6901 pointer segments', () => {
    expect(escapePointer('a/b~c')).toBe('a~1b~0c');
    expect(unescapePointer('a~1b~0c')).toBe('a/b~c');
  });

  it('walks nested objects and arrays with escaped keys', () => {
    const doc = { $defs: { 'a/b': { items: [{ ok: true }] } } };
    expect(walkPointer(doc, '')).toBe(doc);
    expect(walkPointer(doc, '/$defs/a~1b/items/0/ok')).toBe(true);
    expect(walkPointer(doc, '/$defs/missing/x')).toBeUndefined();
  });

  it('parses local and relative cross-file refs and ignores remote URLs', () => {
    expect(parseSchemaRef('#/$defs/foo', 'sub/items.json')).toEqual({
      file: 'sub/items.json',
      rawFile: '',
      pointer: '/$defs/foo',
    });
    expect(parseSchemaRef('../base.json#/$defs/a%20b', 'sub/items.json')).toEqual({
      file: 'base.json',
      rawFile: '../base.json',
      pointer: '/$defs/a b',
    });
    expect(parseSchemaRef('https://example.com/s.json#/x', 'items.json')).toBeNull();
  });
});

describe('resolveRef', () => {
  it('resolves a local pointer', () => {
    const info = resolveRef('#/$defs/item', 'items.json', schemas);
    expect(info?.file).toBe('items.json');
    expect(info?.schema.type).toBe('object');
  });
  it('resolves a cross-file pointer', () => {
    const info = resolveRef('base.json#/$defs/common', 'items.json', schemas);
    expect(info?.schema.required).toEqual(['name', 'source']);
  });
  it('returns null for an unknown file', () => {
    expect(resolveRef('nope.json#/x', 'items.json', schemas)).toBeNull();
  });
});

describe('collectTopLevelProperties', () => {
  it('composes properties across allOf and merges required', () => {
    const root = resolveRef('#/$defs/item', 'items.json', schemas)!;
    const { properties, required } = collectTopLevelProperties(root, schemas);
    expect(Object.keys(properties).sort()).toEqual([
      'name',
      'rarity',
      'source',
      'value',
    ]);
    expect([...required].sort()).toEqual(['name', 'rarity', 'source']);
    expect(properties.value.description).toBe('Cost in cp');
    expect(properties.name.required).toBe(true);
    expect(properties.value.required).toBe(false);
  });
});

describe('getEntityProperties', () => {
  it('orders required-first then alphabetical', () => {
    const list = getEntityProperties(schemas, 'items.json', '#/$defs/item')!;
    expect(list.map((p) => p.name)).toEqual([
      'name',
      'rarity',
      'source',
      'value',
    ]);
  });
});

describe('collectTopLevelProperties — combiner-aware required', () => {
  // anyOf branches: a `magicvariant`-style schema where only one branch applies.
  const branched: SchemaMap = {
    'mv.json': {
      $defs: {
        variant: {
          anyOf: [{ $ref: '#/$defs/site' }, { $ref: '#/$defs/brew' }],
        },
        site: {
          type: 'object',
          properties: { name: {}, inherits: {}, requires: {} },
          required: ['name', 'inherits', 'requires'],
        },
        brew: {
          type: 'object',
          properties: { name: {}, rarity: {}, source: {} },
          required: ['name', 'rarity', 'source'],
        },
      },
    },
  };

  it('unions properties but INTERSECTS required across anyOf branches', () => {
    const root = resolveRef('#/$defs/variant', 'mv.json', branched)!;
    const { properties, required } = collectTopLevelProperties(root, branched);
    // every possible property is surfaced…
    expect(Object.keys(properties).sort()).toEqual([
      'inherits',
      'name',
      'rarity',
      'requires',
      'source',
    ]);
    // …but only `name` is required (common to both branches) — NOT rarity/inherits.
    expect([...required]).toEqual(['name']);
    expect(properties.rarity.required).toBe(false);
    expect(properties.inherits.required).toBe(false);
  });

  it('ignores a `_copy` escape-hatch branch so real required fields survive', () => {
    const withCopy: SchemaMap = {
      'c.json': {
        $defs: {
          entity: {
            anyOf: [{ $ref: '#/$defs/base' }, { required: ['_copy'] }],
          },
          base: {
            type: 'object',
            properties: { name: {}, source: {}, classFeatures: {} },
            required: ['name', 'source', 'classFeatures'],
          },
        },
      },
    };
    const root = resolveRef('#/$defs/entity', 'c.json', withCopy)!;
    const { required } = collectTopLevelProperties(root, withCopy);
    // The `{ required: ['_copy'] }` branch must NOT wipe out the base branch's fields.
    expect([...required].sort()).toEqual(['classFeatures', 'name', 'source']);
  });
});

describe('getEntityBranches', () => {
  const union: SchemaMap = {
    'v.json': {
      $defs: {
        // A 3-branch oneOf: two real shapes plus a `_copy` escape hatch.
        vehicle: {
          oneOf: [
            { $ref: '#/$defs/ship' },
            { $ref: '#/$defs/creature' },
            { required: ['_copy'] },
          ],
        },
        ship: { type: 'object', properties: { name: {}, hull: {}, crew: {} } },
        creature: {
          type: 'object',
          properties: { name: {}, cr: {}, hp: {}, speed: {} },
        },
        single: { type: 'object', properties: { name: {}, page: {} } },
      },
    },
  };

  it('splits a oneOf entity into one branch per real shape', () => {
    const branches = getEntityBranches(union, 'v.json', '#/$defs/vehicle')!;
    // The `_copy`-only branch is not an alternative shape and must be dropped.
    expect(branches.map((b) => b.name)).toEqual(['ship', 'creature']);
    expect(branches[0].properties.map((p) => p.name).sort()).toEqual([
      'crew',
      'hull',
      'name',
    ]);
    expect(branches[1].properties.map((p) => p.name).sort()).toEqual([
      'cr',
      'hp',
      'name',
      'speed',
    ]);
  });

  it('does not union the branches together (the whole point)', () => {
    const branches = getEntityBranches(union, 'v.json', '#/$defs/vehicle')!;
    // `cr` belongs to the creature shape only; it must not leak into the ship shape.
    expect(branches[0].properties.map((p) => p.name)).not.toContain('cr');
    // ...whereas the union view deliberately does merge them.
    const all = getEntityProperties(union, 'v.json', '#/$defs/vehicle')!.map(
      (p) => p.name,
    );
    expect(all).toContain('cr');
    expect(all).toContain('hull');
  });

  it('returns null for a single-shape entity so callers fall back to the union view', () => {
    expect(getEntityBranches(union, 'v.json', '#/$defs/single')).toBeNull();
  });

  it('returns null when only one real branch survives the _copy filter', () => {
    const oneReal: SchemaMap = {
      'o.json': {
        $defs: {
          e: { anyOf: [{ $ref: '#/$defs/b' }, { required: ['_copy'] }] },
          b: { type: 'object', properties: { name: {} } },
        },
      },
    };
    expect(getEntityBranches(oneReal, 'o.json', '#/$defs/e')).toBeNull();
  });

  it('follows a $ref chain to the node carrying the combiner', () => {
    const viaRef: SchemaMap = {
      'r.json': {
        properties: { vehicle: { items: { $ref: '#/$defs/vehicle' } } },
        $defs: {
          vehicle: { oneOf: [{ $ref: '#/$defs/a' }, { $ref: '#/$defs/b' }] },
          a: { type: 'object', properties: { x: {} } },
          b: { type: 'object', properties: { y: {} } },
        },
      },
    };
    const branches = getEntityBranches(
      viaRef,
      'r.json',
      '#/properties/vehicle/items',
    )!;
    expect(branches.map((b) => b.name)).toEqual(['a', 'b']);
  });

  it('labels anonymous (inline) branches by position', () => {
    const inline: SchemaMap = {
      'i.json': {
        $defs: {
          e: {
            oneOf: [
              { type: 'object', properties: { x: {} } },
              { type: 'object', properties: { y: {} } },
            ],
          },
        },
      },
    };
    expect(
      getEntityBranches(inline, 'i.json', '#/$defs/e')!.map((b) => b.name),
    ).toEqual(['branch 1', 'branch 2']);
  });

  it('returns null for an unresolvable rootRef', () => {
    expect(getEntityBranches(union, 'v.json', '#/$defs/nope')).toBeNull();
  });
});
