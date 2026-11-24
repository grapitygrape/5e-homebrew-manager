/**
 * engine/audit/homebrew-parse.ts — turn a parsed homebrew file into a validated,
 * nested outline. The pure core of the Parser page.
 *
 * INTENT
 *   Collect each top-level entity array, validate every object against its
 *   type's schema, wire class/subclass/feature nesting via TYPE_RELATIONSHIPS,
 *   compute depth + totals. No DOM, no CodeMirror — the Svelte component owns the
 *   editor and just renders these nodes, so this logic is unit-tested.
 *
 * REUSE NOTES
 *   - `schemaFor(type)` lets the caller inject the right EntitySchema per array
 *     key (fetched from /api/schema-properties, or BARE_SCHEMA for guideless
 *     types). Keeping it injected keeps this module pure and sync.
 *   - `findEntityEnd` / `extractPropName` are the editor-navigation helpers the
 *     component needs; pure, so they're tested here too.
 */
import type { Entity } from '../types.ts';
import type { EntitySchema } from './validate.ts';
import { validateEntity, TYPE_RELATIONSHIPS } from './validate.ts';

/** Top-level keys that are never entity arrays. */
const SKIP_KEYS = new Set(['_meta', '$schema', '_copy', '_omit', '_base']);

export interface ParsedNode {
  type: string;
  entity: Entity;
  /** Index of this entity within its type's array (disambiguates duplicate names). */
  entityIdx: number;
  errors: string[];
  warnings: string[];
  /** Broken-content-link errors (see audit/link-check.ts). Kept separate from
   *  schema errors so the UI can filter them independently. */
  linkErrors?: string[];
  /** Content-link warnings (unknown source, wrong source, unverified name). */
  linkWarnings?: string[];
  children: ParsedNode[];
  parent: ParsedNode | null;
  depth: number;
}

export interface ParseTotals {
  objects: number;
  types: number;
  errors: number;
  warnings: number;
  clean: number;
  /** Populated by applyLinkChecks (link-check.ts); absent when links weren't audited. */
  brokenLinks?: number;
  linkWarnings?: number;
}

export interface ParsedHomebrew {
  /** All nodes, in file order. */
  nodes: ParsedNode[];
  /** Nodes with no parent (top of the outline). */
  roots: ParsedNode[];
  /** Entity array keys present, in file order. */
  types: string[];
  totals: ParseTotals;
}

/**
 * Validate + nest every entity in a parsed homebrew object.
 * `schemaFor(type)` supplies the schema for each array key.
 */
export function parseHomebrewFile(
  parsed: Record<string, unknown>,
  schemaFor: (type: string) => EntitySchema,
): ParsedHomebrew {
  const types: string[] = [];
  const nodes: ParsedNode[] = [];

  for (const [key, val] of Object.entries(parsed)) {
    if (SKIP_KEYS.has(key) || !Array.isArray(val) || val.length === 0) continue;
    types.push(key);
    const schema = schemaFor(key);
    (val as Entity[]).forEach((entity, entityIdx) => {
      const { errors, warnings } = validateEntity(entity, schema);
      nodes.push({
        type: key,
        entity,
        entityIdx,
        errors,
        warnings,
        children: [],
        parent: null,
        depth: 0,
      });
    });
  }

  // Wire parent→child relationships (classFeature→class, subclass→class, …).
  const byType: Record<string, ParsedNode[]> = {};
  for (const n of nodes) (byType[n.type] ??= []).push(n);
  for (const rel of TYPE_RELATIONSHIPS) {
    const children = byType[rel.childType] || [];
    const parents = byType[rel.parentType] || [];
    for (const child of children) {
      if (child.parent) continue; // a magicvariant matches baseitem OR item, not both
      const parent = parents.find((p) => rel.matchFn(child.entity, p.entity));
      if (parent) {
        child.parent = parent;
        parent.children.push(child);
      }
    }
  }

  const setDepth = (n: ParsedNode, depth: number): void => {
    n.depth = depth;
    n.children.forEach((c) => setDepth(c, depth + 1));
  };
  const roots = nodes.filter((n) => !n.parent);
  roots.forEach((n) => setDepth(n, 0));

  let errors = 0,
    warnings = 0,
    clean = 0;
  for (const n of nodes) {
    errors += n.errors.length;
    warnings += n.warnings.length;
    if (!n.errors.length && !n.warnings.length) clean++;
  }

  return {
    nodes,
    roots,
    types,
    totals: {
      objects: nodes.length,
      types: types.length,
      errors,
      warnings,
      clean,
    },
  };
}

/**
 * Index of the closing brace/bracket that matches the structure opening at
 * `openPos`, honouring strings and escapes. Returns -1 if unbalanced.
 */
export function findEntityEnd(text: string, openPos: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openPos; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Pull the first <code>prop</code> name out of a validation message (for nav). */
export function extractPropName(html: string): string | null {
  const m = /<code>([^<]+)<\/code>/.exec(html || '');
  return m ? m[1] : null;
}

/** Index of the closing quote of the string opening at `start` (honours escapes). */
function scanString(raw: string, start: number): number {
  let esc = false;
  for (let i = start + 1; i < raw.length; i++) {
    if (esc) {
      esc = false;
      continue;
    }
    const c = raw[i];
    if (c === '\\') esc = true;
    else if (c === '"') return i;
  }
  return raw.length - 1;
}

export interface EntityPosition {
  node: ParsedNode;
  /** Offset of the entity's opening `{` in the raw text. */
  pos: number;
  /** Offset of its matching `}`. */
  end: number;
}

/** A `[start, end]` range of raw text, both offsets inclusive. */
export interface TextSpan {
  start: number;
  end: number;
}

export interface TopLevelValue extends TextSpan {
  key: string;
  /** Each element's span, when the value is an array. */
  items?: TextSpan[];
}

export interface TopLevelScan {
  /** Offsets of the document's opening `{` and closing `}` (-1 if unbalanced). */
  open: number;
  close: number;
  values: TopLevelValue[];
}

/**
 * One bracket scan over the document's top level: each key's value span, and
 * each array element's span. Stops at the first unbalanced structure.
 */
export function scanTopLevel(raw: string): TopLevelScan {
  const values: TopLevelValue[] = [];
  const open = raw.indexOf('{');
  if (open === -1) return { open, close: -1, values };

  let i = open + 1;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '}') return { open, close: i, values };
    if (ch !== '"') {
      i++;
      continue;
    }

    // A top-level key. Skip to its value; recurse only into arrays.
    const keyEnd = scanString(raw, i);
    const key = raw.slice(i + 1, keyEnd);
    let j = keyEnd + 1;
    while (j < raw.length && /\s/.test(raw[j])) j++;
    if (raw[j] !== ':') {
      i = keyEnd + 1;
      continue;
    }
    j++;
    while (j < raw.length && /\s/.test(raw[j])) j++;

    const vch = raw[j];
    let vEnd: number;
    let items: TextSpan[] | undefined;
    if (vch === '{' || vch === '[') {
      vEnd = findEntityEnd(raw, j);
      if (vEnd === -1) break;
      if (vch === '[') items = scanItems(raw, j, vEnd);
    } else if (vch === '"') {
      vEnd = scanString(raw, j);
    } else {
      vEnd = j;
      while (vEnd < raw.length && !/[,}]/.test(raw[vEnd])) vEnd++;
      vEnd--;
    }
    values.push({ key, start: j, end: vEnd, ...(items && { items }) });
    i = vEnd + 1;
  }
  return { open, close: -1, values };
}

/** Element spans of the array `[` at `open` … `]` at `close`. */
function scanItems(raw: string, open: number, close: number): TextSpan[] {
  const out: TextSpan[] = [];
  let k = open + 1;
  while (k < close) {
    const c = raw[k];
    if (c === ',' || /\s/.test(c)) {
      k++;
      continue;
    }
    let e: number;
    if (c === '{' || c === '[') {
      e = findEntityEnd(raw, k);
      if (e === -1) break;
    } else if (c === '"') {
      e = scanString(raw, k);
    } else {
      e = k;
      while (e < close && !/[,\]]/.test(raw[e])) e++;
      e--;
    }
    out.push({ start: k, end: e });
    k = e + 1;
  }
  return out;
}

/**
 * Locate every parsed entity's exact `{`…`}` range in the raw JSON text with a
 * single top-level bracket scan — no reliance on `name` appearing anywhere
 * (bookData/itemGroup/fluff entities are often unnamed). Every array element
 * consumes an entityIdx (matching parseHomebrewFile, which validates non-object
 * elements too), so indices stay aligned even in malformed arrays.
 */
export function buildEntityPositions(
  raw: string,
  nodes: ParsedNode[],
): EntityPosition[] {
  const byType = new Map<string, Map<number, ParsedNode>>();
  for (const n of nodes) {
    let m = byType.get(n.type);
    if (!m) byType.set(n.type, (m = new Map()));
    m.set(n.entityIdx, n);
  }
  const out: EntityPosition[] = [];
  for (const v of scanTopLevel(raw).values) {
    const m = byType.get(v.key);
    if (!m || !v.items) continue;
    v.items.forEach((span, idx) => {
      const node = m.get(idx);
      if (node && raw[span.start] === '{')
        out.push({ node, pos: span.start, end: span.end });
    });
  }
  out.sort((a, b) => a.pos - b.pos);
  return out;
}
