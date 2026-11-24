/**
 * lib/editor/json-context.ts — where the cursor is in a JSON document, for
 * schema autocomplete: the path to it, whether it's at a property name, a
 * value or a `{@tag`, and the `type` of each enclosing object.
 *
 * Reads CodeMirror's JSON syntax tree (@codemirror/lang-json), which keeps
 * working while the text is half-typed. No DOM, so it's tested with a bare
 * EditorState.
 */
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import type { PathSeg } from '$lib/engine/audit';

export interface CursorContext {
  kind: 'property' | 'value' | 'tag';
  /** Segments from the root to the object (property) or the value. */
  path: PathSeg[];
  /** `types[k]`: the `type` of the object reached after k segments, if any. */
  types: (string | undefined)[];
  /** Keys already in the object, for property completion. */
  present: Set<string>;
  /** The span a completion replaces. */
  from: number;
  to: number;
  /** A property name already followed by `:` (replace only the name). */
  hasColon: boolean;
}

const VALUE = new Set([
  'Object',
  'Array',
  'String',
  'Number',
  'True',
  'False',
  'Null',
]);

export function cursorContext(
  state: EditorState,
  pos: number,
): CursorContext | null {
  const inner = syntaxTree(state).resolveInner(pos, -1);
  const str = up(inner, ['String', 'PropertyName']);
  const inStr = str && pos > str.from && (pos < str.to || !closed(state, str));

  if (inStr && str) {
    const before = state.sliceDoc(str.from + 1, pos);
    const tag = /\{@(\w*)$/.exec(before);
    if (tag) return make(state, 'tag', str, pos - tag[1].length, pos, null);
    if (str.name === 'PropertyName')
      return make(state, 'property', objectOf(str), str.from, str.to, null);
    return make(state, 'value', str, str.from, str.to, null);
  }

  // Between tokens, or on a bare word being typed.
  const container = up(inner, ['Object', 'Array']);
  if (!container) return null;
  const lead = state.sliceDoc(state.doc.lineAt(pos).from, pos);
  const word = /"?[\w$@-]*$/.exec(lead)?.[0] ?? '';
  const from = pos - word.length;
  if (container.name === 'Array')
    return make(
      state,
      'value',
      container,
      from,
      pos,
      countBefore(container, from),
    );
  if (prevChar(state, from) === ':') {
    const prop = lastPropertyBefore(container, from);
    return make(
      state,
      'value',
      container,
      from,
      pos,
      prop ? name(state, prop) : '',
    );
  }
  return make(state, 'property', container, from, pos, null);
}

/**
 * `anchor` is the node the path leads to: the object for a property, the
 * value itself, or the container a new value goes into (then `slot` is the
 * key or index it will have).
 */
function make(
  state: EditorState,
  kind: CursorContext['kind'],
  anchor: SyntaxNode | null,
  from: number,
  to: number,
  slot: PathSeg | null,
): CursorContext | null {
  if (!anchor) return null;
  const path: PathSeg[] = [];
  const containers: SyntaxNode[] = [];
  for (let n: SyntaxNode | null = anchor; n; n = n.parent) {
    if (n.name === 'Object' || n.name === 'Array') containers.unshift(n);
    const p = n.parent;
    if (!p || !VALUE.has(n.name)) continue;
    if (p.name === 'Property') path.unshift(name(state, p));
    else if (p.name === 'Array') path.unshift(countBefore(p, n.from));
  }
  if (slot !== null) path.push(slot);
  const types = containers.map((c) =>
    c.name === 'Object' ? typeOf(state, c) : undefined,
  );

  const present = new Set<string>();
  if (kind === 'property' && anchor.name === 'Object')
    for (let c = anchor.firstChild; c; c = c.nextSibling) {
      const k = c.name === 'Property' ? c.getChild('PropertyName') : null;
      if (k && !(k.from <= from && to <= k.to)) present.add(name(state, c));
    }

  const hasColon =
    kind === 'property' &&
    state
      .sliceDoc(to, to + 40)
      .trimStart()
      .startsWith(':');
  return { kind, path, types, present, from, to, hasColon };
}

function up(node: SyntaxNode, names: string[]): SyntaxNode | null {
  for (let n: SyntaxNode | null = node; n; n = n.parent)
    if (names.includes(n.name)) return n;
  return null;
}

function objectOf(propName: SyntaxNode): SyntaxNode | null {
  const obj = propName.parent?.parent ?? null;
  return obj?.name === 'Object' ? obj : null;
}

/** Does the string token end with its closing quote? */
function closed(state: EditorState, str: SyntaxNode): boolean {
  const t = state.sliceDoc(str.from, str.to);
  return t.length >= 2 && t.endsWith('"') && !t.endsWith('\\"');
}

function unquote(s: string): string {
  try {
    return JSON.parse(s);
  } catch {
    return s.replace(/^"|"$/g, '');
  }
}

function name(state: EditorState, prop: SyntaxNode): string {
  const k = prop.getChild('PropertyName');
  return k ? unquote(state.sliceDoc(k.from, k.to)) : '';
}

function countBefore(arr: SyntaxNode, pos: number): number {
  let n = 0;
  for (let c = arr.firstChild; c; c = c.nextSibling)
    if (VALUE.has(c.name) && c.to <= pos) n++;
  return n;
}

function lastPropertyBefore(obj: SyntaxNode, pos: number): SyntaxNode | null {
  let last: SyntaxNode | null = null;
  for (let c = obj.firstChild; c; c = c.nextSibling)
    if (c.name === 'Property' && c.from < pos) last = c;
  return last;
}

function typeOf(state: EditorState, obj: SyntaxNode): string | undefined {
  for (let c = obj.firstChild; c; c = c.nextSibling) {
    if (c.name !== 'Property' || name(state, c) !== 'type') continue;
    const v = c.getChild('String');
    return v ? unquote(state.sliceDoc(v.from, v.to)) : undefined;
  }
  return undefined;
}

function prevChar(state: EditorState, pos: number): string {
  return state
    .sliceDoc(Math.max(0, pos - 200), pos)
    .trimEnd()
    .slice(-1);
}
