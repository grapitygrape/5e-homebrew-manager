/** Tests for engine/validate.ts and engine/merge.ts. */
import { describe, it, expect } from 'vitest';
import {
  validateEntity,
  withNameSet,
  type EntitySchema,
} from '../audit/validate.ts';
import { mergeEntities } from '../merge/merge.ts';
import { buildBlocklistLookup } from '../merge/blocklist.ts';
import type { Entity } from '../types.ts';

const itemSchema: EntitySchema = withNameSet({
  entityType: 'item',
  arrayProp: 'item',
  label: 'Item',
  required: ['name', 'source'],
  properties: [
    { name: 'name', type: 'string', description: '', required: true },
    { name: 'source', type: 'string', description: '', required: true },
    { name: 'entries', type: 'array', description: '', required: false },
  ],
});

describe('validateEntity', () => {
  it('flags a missing required property', () => {
    const { errors } = validateEntity({ name: 'X' }, itemSchema);
    expect(errors.some((e) => e.includes('source'))).toBe(true);
  });
  it('warns on unknown top-level keys but ignores _-prefixed', () => {
    const { warnings } = validateEntity(
      { name: 'X', source: 'Y', foo: 1, _internal: 2 },
      itemSchema,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('foo');
  });
  it('checks basic shapes', () => {
    const { errors } = validateEntity(
      { name: 'X', source: 'Y', entries: 'oops' },
      itemSchema,
    );
    expect(errors.some((e) => e.includes('entries'))).toBe(true);
  });
  it('treats a required field present in `inherits` as satisfied (magicvariant)', () => {
    const variantSchema = withNameSet({
      entityType: 'item',
      arrayProp: 'magicvariant',
      label: 'Magic Variant',
      required: ['name', 'source'],
      properties: [
        { name: 'name', type: 'string', description: '', required: true },
        { name: 'source', type: 'string', description: '', required: true },
        { name: 'inherits', type: 'object', description: '', required: false },
      ],
    });
    // source only in inherits — should NOT be flagged missing.
    const { errors } = validateEntity(
      {
        name: 'Champion’s Weapon',
        inherits: { source: 'MoD', rarity: 'uncommon' },
      },
      variantSchema,
    );
    expect(errors).toHaveLength(0);
  });
  it('asks a `_copy` entity only for its own name and source', () => {
    const monsterSchema = withNameSet({
      entityType: 'monster',
      arrayProp: 'monster',
      label: 'Monster',
      required: ['name', 'source', 'size', 'type', 'entries'],
      properties: [],
    });
    const copy = { _copy: { name: 'Goblin', source: 'MM' } };
    expect(
      validateEntity(
        { name: 'Goblin Boss', source: 'MyBrew', ...copy },
        monsterSchema,
      ).errors,
    ).toEqual([]);
    const { errors } = validateEntity(
      { name: 'Goblin Boss', ...copy },
      monsterSchema,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('source');
  });
});

describe('mergeEntities', () => {
  const sword: Entity = {
    name: 'Sword',
    source: 'PHB',
    value: 1000,
    entries: ['A sword.'],
  };
  const flame: Entity = {
    name: 'Flame Sword',
    source: 'MyBrew',
    _copy: {
      name: 'Sword',
      source: 'PHB',
      _mod: { entries: { mode: 'appendArr', items: 'On fire.' } },
    },
  };

  it('tags provenance and resolves homebrew _copy against official base', () => {
    const out = mergeEntities({
      type: 'item',
      official: [sword],
      homebrew: [{ file: 'brew.json', entities: [flame] }],
      blocklistCategory: 'item',
    });
    expect(out).toHaveLength(2);
    const resolved = out.find((e) => e.name === 'Flame Sword')!;
    expect(resolved._isHomebrew).toBe(true);
    expect(resolved._homebrewFile).toBe('brew.json');
    expect(resolved.entries).toEqual(['A sword.', 'On fire.']);
    expect(out.find((e) => e.name === 'Sword')!._isHomebrew).toBe(false);
  });

  it('drops blocklisted entities before resolving', () => {
    const blocklist = buildBlocklistLookup({
      blocklist: [{ hash: 'sword', category: 'item', source: 'phb' }],
    });
    const out = mergeEntities({
      type: 'item',
      official: [sword],
      homebrew: [{ file: 'b.json', entities: [flame] }],
      blocklistCategory: 'item',
      blocklist,
    });
    expect(out.find((e) => e.name === 'Sword')).toBeUndefined();
    expect(out).toHaveLength(1);
  });
});
