/**
 * Tests for engine/audit/schema-validate.ts, schema-complete.ts and
 * json-locate.ts against a small schema folder shaped like 5etools-utils'
 * brew schemas: files with their own `$id`, `../` refs between folders, an
 * entry `anyOf` told apart by `type`, a `oneOf` nested inside one entry type,
 * and an entity with a `_copy` form.
 */
import { describe, it, expect } from 'vitest';
import {
  createSchemaValidator,
  documentKind,
} from '../audit/schema-validate.ts';
import { issueLocation, pointerLabel } from '../audit/schema-messages.ts';
import {
  propertyOptions,
  resolvePath,
  snippetOptions,
  valueOptions,
} from '../audit/schema-complete.ts';
import { locatePointers } from '../audit/json-locate.ts';
import type { SchemaMap } from '../audit/schema.ts';

const entryBase = (
  type: string,
  extra: Record<string, unknown>,
  req: string[],
) => ({
  type: 'object',
  properties: {
    type: { const: type },
    name: { type: 'string' },
    ...extra,
  },
  required: ['type', ...req],
  additionalProperties: false,
});

const schemas: SchemaMap = {
  'homebrew.json': {
    type: 'object',
    properties: {
      _meta: { $ref: 'util.json#/$defs/meta' },
      spell: { $ref: 'spells/spells.json#/properties/spell' },
    },
    required: ['_meta'],
    additionalProperties: false,
  },
  'util.json': {
    $id: 'util.json',
    $defs: {
      meta: {
        type: 'object',
        properties: {
          sources: { type: 'array', items: { type: 'object' } },
          dateAdded: { type: 'integer' },
        },
        required: ['sources'],
      },
      source: { type: 'string' },
      spellSchool: {
        type: 'string',
        description: '- A: Abjuration\n- V: Evocation',
      },
    },
  },
  'entry.json': {
    $id: 'entry.json',
    anyOf: [
      { $ref: '#/$defs/entryEntries' },
      { $ref: '#/$defs/entryList' },
      { $ref: '#/$defs/entryItem' },
      { type: 'string' },
      { type: 'integer' },
    ],
    $defs: {
      entryEntries: entryBase(
        'entries',
        { entries: { type: 'array', items: { $ref: '#' } } },
        ['entries'],
      ),
      entryList: entryBase(
        'list',
        {
          items: { type: 'array', items: { $ref: '#' } },
          style: { enum: ['list-hang', 'list-no-bullets'] },
        },
        ['items'],
      ),
      // Like the real entryItem: the type lives inside a oneOf.
      entryItem: {
        oneOf: [
          entryBase('item', { entry: { type: 'string' } }, ['entry']),
          entryBase('item', { entries: { type: 'array' } }, ['entries']),
        ],
      },
    },
  },
  'spells/spells.json': {
    $id: 'spells.json',
    properties: {
      spell: {
        type: 'array',
        items: { $ref: '#/$defs/spell' },
        minItems: 1,
        uniqueItems: true,
      },
    },
    $defs: {
      spell: {
        anyOf: [
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
              source: { $ref: '../util.json#/$defs/source' },
              level: { type: 'integer' },
              school: { $ref: '../util.json#/$defs/spellSchool' },
              entries: { type: 'array', items: { $ref: '../entry.json' } },
            },
            required: ['name', 'source', 'level', 'entries'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              name: { type: 'string' },
              source: { type: 'string' },
              _copy: { type: 'object' },
            },
            required: ['name', 'source', '_copy'],
          },
        ],
      },
    },
  },
};

const meta = { sources: [{ json: 'TST' }] };
const spell = (over: Record<string, unknown> = {}) => ({
  name: 'Bolt',
  source: 'TST',
  level: 1,
  entries: ['Zap.'],
  ...over,
});
const v = createSchemaValidator(schemas);
const msgs = (issues: { pointer: string; message: string }[]) =>
  issues.map((i) => `${i.pointer} ${i.message}`);

describe('createSchemaValidator', () => {
  it('passes a valid brew', () => {
    expect(v.validate({ _meta: meta, spell: [spell()] }, 'brew')).toEqual([]);
  });

  it('names the entry type a typo was meant to be', () => {
    const doc = {
      _meta: meta,
      spell: [spell({ entries: [{ type: 'lst', items: [] }] })],
    };
    expect(msgs(v.validate(doc, 'brew'))).toEqual([
      '/spell/0/entries/0/type Unknown type "lst". Did you mean "list"?',
    ]);
  });

  it('checks an entry against its own type only', () => {
    const doc = {
      _meta: meta,
      spell: [spell({ entries: [{ type: 'list', itemz: [] }] })],
    };
    expect(v.validate(doc, 'brew')).toEqual([
      {
        pointer: '/spell/0/entries/0',
        atKey: false,
        keyword: 'required',
        message: 'Missing required property "items".',
      },
      {
        pointer: '/spell/0/entries/0/itemz',
        atKey: true,
        keyword: 'additionalProperties',
        message: 'Unknown property "itemz".',
      },
    ]);
  });

  it('finds an entry type whose `type` sits inside a oneOf', () => {
    const doc = {
      _meta: meta,
      spell: [spell({ entries: [{ type: 'itme', entry: 'x' }] })],
    };
    expect(msgs(v.validate(doc, 'brew'))).toEqual([
      '/spell/0/entries/0/type Unknown type "itme". Did you mean "item"?',
    ]);
  });

  it('reports nested problems and several entities in one pass', () => {
    const doc = {
      _meta: meta,
      spell: [
        spell({ level: 'one' }),
        spell({
          name: 'Two',
          entries: [
            { type: 'entries', entries: [{ type: 'list', items: [3.5] }] },
          ],
        }),
      ],
    };
    expect(msgs(v.validate(doc, 'brew'))).toEqual([
      '/spell/0/level Must be an integer.',
      '/spell/1/entries/0/entries/0/items/0 Must be an object or a string or an integer.',
    ]);
  });

  it('treats a half-written spell as a spell, not a _copy', () => {
    const doc = { _meta: meta, spell: [{ name: 'New' }] };
    expect(msgs(v.validate(doc, 'brew'))).toEqual([
      '/spell/0 Missing required property "source".',
      '/spell/0 Missing required property "level".',
      '/spell/0 Missing required property "entries".',
    ]);
  });

  it('checks the top level: _meta, unknown arrays, duplicates', () => {
    const doc = { spell: [spell(), spell()], monsters: [] };
    expect(msgs(v.validate(doc, 'brew'))).toEqual([
      ' Missing required property "_meta".',
      '/spell/1 Duplicate of item 0; each must be unique.',
      '/monsters Unknown property "monsters".',
    ]);
  });

  it('reports a bad enum value with the allowed values', () => {
    const doc = [{ type: 'list', items: [], style: 'list-hanging' }];
    expect(msgs(v.validate(doc, 'entry'))).toEqual([
      '/0/style Must be one of "list-hang", "list-no-bullets".',
    ]);
  });

  it('gives the same answer from its cache, and sees an edit', () => {
    const doc = { _meta: meta, spell: [spell({ level: 'x' })] };
    const first = v.validate(doc, 'brew');
    expect(v.validate(doc, 'brew')).toEqual(first);
    doc.spell[0].level = 2;
    expect(v.validate(doc, 'brew')).toEqual([]);
  });

  it('accepts a schema folder one level up (schema/ instead of schema/brew/)', () => {
    const nested = Object.fromEntries(
      Object.entries(schemas).map(([k, s]) => [`brew/${k}`, s]),
    );
    const v2 = createSchemaValidator(nested);
    expect(v2.validate({ _meta: meta, spell: [spell()] }, 'brew')).toEqual([]);
  });

  it('refuses a folder without homebrew.json', () => {
    expect(() => createSchemaValidator({ 'entry.json': {} })).toThrow(
      /homebrew\.json/,
    );
  });
});

describe('documentKind', () => {
  it('tells a brew from an entry', () => {
    expect(documentKind({ _meta: {} })).toBe('brew');
    expect(documentKind({ spell: [] }, v.brewProps)).toBe('brew');
    expect(documentKind({ type: 'list', items: [] }, v.brewProps)).toBe(
      'entry',
    );
    expect(documentKind([{ type: 'entries' }])).toBe('entry');
    expect(documentKind('text')).toBe('entry');
  });
});

describe('issueLocation / pointerLabel', () => {
  it('splits a pointer into entity and path', () => {
    expect(issueLocation('/spell/3/entries/0/type')).toEqual({
      type: 'spell',
      entityIdx: 3,
      path: 'entries[0].type',
    });
    expect(issueLocation('/_meta/sources')).toBeNull();
    expect(pointerLabel('/_meta/sources/0/json')).toBe('_meta.sources[0].json');
  });
});

describe('schema completion', () => {
  const R = v.rootFor('brew');

  it('lists an entity form’s properties, required first, without _copy', () => {
    const opts = propertyOptions(
      v.index,
      resolvePath(v.index, R, ['spell', 0]),
      undefined,
      new Set(['name']),
    );
    expect(opts.filter((o) => o.required).map((o) => o.name)).toEqual([
      'source',
      'entries',
      'level',
    ]);
    expect(opts.map((o) => o.name)).toContain('_copy');
  });

  it('narrows entry properties by the object’s type', () => {
    const at = resolvePath(v.index, R, ['spell', 0, 'entries', 0]);
    const names = propertyOptions(v.index, at, 'list', new Set(['type'])).map(
      (o) => o.name,
    );
    expect(names).toEqual(['items', 'name', 'style']);
  });

  it('offers enum values, and codes listed in a description', () => {
    const style = resolvePath(
      v.index,
      R,
      ['spell', 0, 'entries', 0, 'style'],
      (k) => (k === 4 ? 'list' : undefined),
    );
    expect(valueOptions(v.index, style).map((o) => o.insert)).toEqual([
      '"list-hang"',
      '"list-no-bullets"',
    ]);
    const school = resolvePath(v.index, R, ['spell', 0, 'school']);
    expect(valueOptions(v.index, school)).toEqual([
      { insert: '"A"', label: 'A (Abjuration)' },
      { insert: '"V"', label: 'V (Evocation)' },
    ]);
  });

  it('builds entry snippets from each type’s required properties', () => {
    const at = resolvePath(v.index, R, ['spell', 0, 'entries', 0]);
    const list = snippetOptions(v.index, at).find((s) => s.label === 'list');
    expect(list?.template).toBe('{\n\t"type": "list",\n\t"items": [${1}]\n}');
  });

  it('builds a new-entity snippet with the brew’s source', () => {
    const at = resolvePath(v.index, R, ['spell', 0]);
    const [full, copy] = snippetOptions(v.index, at, {
      defaultSource: 'TST',
      noun: 'spell',
    });
    expect(full.label).toBe('spell');
    expect(full.template).toBe(
      '{\n\t"name": "${1}",\n\t"source": "${2:TST}",\n\t"level": ${3:0},\n\t"entries": [${4}]\n}',
    );
    // No spaces: CodeMirror restarts matching after a space.
    expect(copy.label).toBe('spell_copy');
  });
});

describe('locatePointers', () => {
  it('finds values and keys, including escaped names and strings', () => {
    const text = JSON.stringify(
      { a: { 'b/c': [1, { d: 'x"y' }] }, e: true },
      null,
      2,
    );
    const m = locatePointers(text, ['/a/b~1c/1/d', '/e', '/missing']);
    const d = m.get('/a/b~1c/1/d')!;
    expect(text.slice(d.from, d.to)).toBe('"x\\"y"');
    expect(text.slice(d.keyFrom, d.keyTo)).toBe('"d"');
    const e = m.get('/e')!;
    expect(text.slice(e.from, e.to)).toBe('true');
    expect(m.has('/missing')).toBe(false);
  });
});
