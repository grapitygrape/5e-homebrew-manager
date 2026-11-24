/** Tests for engine/type-schema.ts — schema-by-type resolution via homebrew.json. */
import { describe, it, expect } from 'vitest';
import {
  buildTypeSchema,
  entityTypeFor,
  typeLabelFor,
} from '../audit/type-schema.ts';
import type { SchemaMap } from '../audit/schema.ts';

// Mirrors the real brew homebrew.json shape: properties[type] → array → items.
const schemas: SchemaMap = {
  'homebrew.json': {
    properties: {
      item: { $ref: 'items.json#/properties/item' },
      bookData: { $ref: '#/$defs/wrappedBookData' },
    },
    $defs: {
      wrappedBookData: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            source: { type: 'string' },
            data: { type: 'array' },
          },
          required: ['id', 'source', 'data'],
        },
      },
    },
  },
  'items.json': {
    properties: { item: { type: 'array', items: { $ref: '#/$defs/item' } } },
    $defs: {
      item: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          source: { type: 'string' },
          value: { type: 'integer' },
        },
        required: ['name', 'source'],
      },
    },
  },
};

describe('buildTypeSchema', () => {
  it('resolves a cross-file item type to its real properties', () => {
    const s = buildTypeSchema(schemas, 'item')!;
    expect(s.entityType).toBe('item');
    expect(s.required.sort()).toEqual(['name', 'source']);
    expect(s.properties.map((p) => p.name)).toEqual([
      'name',
      'source',
      'value',
    ]);
  });

  it('reads bookData required as id/source/data — NOT name (the hardcoded-fallback bug)', () => {
    const s = buildTypeSchema(schemas, 'bookData')!;
    expect(s.required.sort()).toEqual(['data', 'id', 'source']);
    expect(s.required).not.toContain('name');
    expect(s.label).toBe('Book Data');
  });

  it('returns null for an unknown array key', () => {
    expect(buildTypeSchema(schemas, 'nonsense')).toBeNull();
  });
});

describe('entityTypeFor / typeLabelFor', () => {
  it('maps variant kin to the item renderer', () => {
    expect(entityTypeFor('magicvariant')).toBe('item');
    expect(entityTypeFor('baseitem')).toBe('item');
    expect(entityTypeFor('item')).toBe('item');
    expect(typeLabelFor('magicvariant')).toBe('Magic Variant');
  });
});
