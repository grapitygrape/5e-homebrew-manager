/** Tests for engine/guide-schema.ts — guide → schema payload assembly. */
import { describe, it, expect } from 'vitest';
import {
  buildGuideSchema,
  buildAllGuideSchemas,
} from '../audit/guide-schema.ts';
import type { SchemaMap } from '../audit/schema.ts';

// Fixture mirrors GUIDE_MAP['item-conversion.md'] → items.json #/$defs/item.
const schemas: SchemaMap = {
  'base.json': {
    $defs: {
      common: {
        type: 'object',
        properties: { name: { type: 'string' }, source: { type: 'string' } },
        required: ['name', 'source'],
      },
    },
  },
  'items.json': {
    $defs: {
      item: {
        type: 'object',
        allOf: [{ $ref: 'base.json#/$defs/common' }],
        properties: { value: { type: 'integer' }, rarity: { type: 'string' } },
        required: ['rarity'],
      },
    },
  },
};

describe('buildGuideSchema', () => {
  it('assembles type/arrayProp/label + properties for a known guide', () => {
    const payload = buildGuideSchema(schemas, 'item-conversion.md')!;
    expect(payload.entityType).toBe('item');
    expect(payload.arrayProp).toBe('item');
    expect(payload.label).toBe('Item');
    expect(payload.required.sort()).toEqual(['name', 'rarity', 'source']);
    expect(payload.properties.map((p) => p.name)).toEqual([
      'name',
      'rarity',
      'source',
      'value',
    ]);
  });

  it('returns null for an unknown guide', () => {
    expect(buildGuideSchema(schemas, 'nope.md')).toBeNull();
  });
});

describe('buildAllGuideSchemas', () => {
  it('includes an entry for every guide in the map', () => {
    const all = buildAllGuideSchemas(schemas);
    expect(all['item-conversion.md']).not.toBeNull();
    // weapon/tool share items.json and also resolve against this fixture.
    expect(all['weapon-conversion.md']?.entityType).toBe('item');
    // a guide whose schema isn't in the fixture resolves to null, not a throw.
    expect(all['spell-conversion.md']).toBeNull();
  });
});
