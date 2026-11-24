/** Tests for lib/editor/json-context.ts — the path and kind at the cursor. */
import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { ensureSyntaxTree } from '@codemirror/language';
import { cursorContext } from '../json-context.ts';

/** `|` marks the cursor. */
function at(text: string) {
  const pos = text.indexOf('|');
  const doc = text.slice(0, pos) + text.slice(pos + 1);
  const state = EditorState.create({ doc, extensions: [json()] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return { ctx: cursorContext(state, pos), doc };
}

describe('cursorContext', () => {
  it('finds a property name being typed in an entity', () => {
    const { ctx, doc } = at('{"spell": [{"name": "A", "le|"}]}');
    expect(ctx).toMatchObject({ kind: 'property', path: ['spell', 0] });
    expect([...ctx!.present]).toEqual(['name']);
    expect(doc.slice(ctx!.from, ctx!.to)).toBe('"le"');
  });

  it('finds an empty key slot after a comma', () => {
    const { ctx } = at('{"spell": [{"name": "A", |}]}');
    expect(ctx).toMatchObject({ kind: 'property', path: ['spell', 0] });
  });

  it('finds a value after a colon, with the key in the path', () => {
    const { ctx } = at('{"spell": [{"name": "A", "school": |}]}');
    expect(ctx).toMatchObject({ kind: 'value', path: ['spell', 0, 'school'] });
  });

  it('finds an existing string value and spans the whole string', () => {
    const { ctx, doc } = at('{"spell": [{"school": "V|"}]}');
    expect(ctx).toMatchObject({ kind: 'value', path: ['spell', 0, 'school'] });
    expect(doc.slice(ctx!.from, ctx!.to)).toBe('"V"');
  });

  it('counts array items before a new slot', () => {
    const { ctx } = at('{"spell": [{"entries": ["a", {"type": "list"}, |]}]}');
    expect(ctx).toMatchObject({
      kind: 'value',
      path: ['spell', 0, 'entries', 2],
    });
  });

  it('records the type of each enclosing object', () => {
    const { ctx } = at(
      '{"spell": [{"entries": [{"type": "list", "items": [], |}]}]}',
    );
    expect(ctx!.kind).toBe('property');
    expect(ctx!.path).toEqual(['spell', 0, 'entries', 0]);
    // root, spell array, spell, entries array, the list
    expect(ctx!.types).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'list',
    ]);
  });

  it('finds a {@tag being typed inside a string', () => {
    const { ctx, doc } = at('{"spell": [{"entries": ["Cast {@sp|"]}]}');
    expect(ctx!.kind).toBe('tag');
    expect(doc.slice(ctx!.from, ctx!.to)).toBe('sp');
  });

  it('knows a property name already has its colon', () => {
    const { ctx } = at('{"_meta": {"sou|": []}}');
    expect(ctx).toMatchObject({ kind: 'property', path: ['_meta'] });
    expect(ctx!.hasColon).toBe(true);
  });
});
