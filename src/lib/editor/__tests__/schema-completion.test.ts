/** Tests for lib/editor/schema-completion.ts — cursor to completion options. */
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { ensureSyntaxTree } from '@codemirror/language';
import {
  CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { createSchemaValidator } from '$lib/engine/audit';
import { schemaCompletionSource } from '../schema-completion.ts';

const validator = createSchemaValidator({
  'homebrew.json': {
    type: 'object',
    properties: {
      _meta: { type: 'object' },
      spell: { type: 'array', items: { $ref: 'spells.json#/$defs/spell' } },
    },
  },
  'entry.json': {
    $id: 'entry.json',
    anyOf: [
      {
        type: 'object',
        properties: {
          type: { const: 'list' },
          items: { type: 'array', items: { $ref: '#' } },
          style: { enum: ['list-hang'] },
        },
        required: ['type', 'items'],
      },
      { type: 'string' },
    ],
  },
  'spells.json': {
    $id: 'spells.json',
    $defs: {
      spell: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          source: { type: 'string' },
          entries: { type: 'array', items: { $ref: 'entry.json' } },
        },
        required: ['name', 'source'],
      },
    },
  },
});
const source = schemaCompletionSource(() => ({
  validator,
  kind: 'brew',
  defaultSource: 'TST',
}));

/** `|` marks the cursor. */
function complete(text: string): CompletionResult | null {
  const pos = text.indexOf('|');
  const doc = text.slice(0, pos) + text.slice(pos + 1);
  const state = EditorState.create({ doc, extensions: [json()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return source(new CompletionContext(state, pos, true)) as CompletionResult;
}
const labels = (r: CompletionResult | null) => r?.options.map((o) => o.label);

describe('schemaCompletionSource', () => {
  it('offers an entity’s missing properties, required first', () => {
    const r = complete('{"_meta": {}, "spell": [{"name": "A", |}]}');
    expect(labels(r)).toEqual(['source', 'entries']);
    expect(r!.options[0].apply).toBe('"source": ');
  });

  it('offers enum values for a property', () => {
    const r = complete(
      '{"spell": [{"entries": [{"type": "list", "items": [], "style": |}]}]}',
    );
    expect(labels(r)).toEqual(['"list-hang"']);
  });

  it('offers entry snippets in an entries array, and new-entity ones at the top', () => {
    expect(labels(complete('{"spell": [{"entries": [|]}]}'))).toContain('list');
    expect(labels(complete('{"spell": [|]}'))).toEqual(['spell']);
  });

  it('matches a template by its type name, replacing the typed word', () => {
    const r = complete(
      '{"spell": [\n  {"name": "a", "source": "x"},\n  spe|\n]}',
    );
    const doc = '{"spell": [\n  {"name": "a", "source": "x"},\n  spe\n]}';
    expect(labels(r)).toEqual(['spell']);
    expect(doc.slice(r!.from, r!.to)).toBe('spe');
  });

  it('starts a new top-level array with a template inside', () => {
    const r = complete('{"_meta": {}, |}');
    const spell = r!.options.find((o) => o.label === 'spell')!;
    expect(spell.detail).toBe('array with a template');
    // Applying it inserts the array and template in place of the typed text.
    let doc = '';
    const view = {
      state: EditorState.create({
        doc: '{"_meta": {}, }',
        extensions: [json()],
      }),
      dispatch(tr: { state: EditorState }) {
        this.state = tr.state;
        doc = tr.state.doc.toString();
      },
    };
    (spell.apply as (...a: unknown[]) => void)(view, spell, r!.from, r!.to);
    expect(doc).toBe(
      '{"_meta": {}, "spell": [\n  {\n    "name": "",\n    "source": "TST"\n  }\n]}',
    );
  });

  it('offers tag names after {@ inside a string', () => {
    const r = complete('{"spell": [{"entries": ["See {@spe|"]}]}');
    expect(labels(r)).toContain('spell');
    expect(r!.options.find((o) => o.label === 'spell')!.apply).toBe('spell ');
  });
});
