/**
 * engine/audit/schema-complete.ts — what the brew schema allows at a spot in a
 * document, for the parser's autocomplete: property names, values, and
 * snippets for new entries and entities.
 *
 * INTENT
 *   The editor works out the path to the cursor (and each enclosing object's
 *   `type`); this resolves that path through the schemas and lists the
 *   options. Snippets are generated from each form's required properties, so
 *   they follow the schema when 5etools-utils changes.
 *
 * PURE
 *   Reads a SchemaIndex (schema-shape.ts); no editor types.
 */
import { locId, type SchemaIndex, type SchemaLoc } from './schema-shape.ts';

// Schema nodes are arbitrary JSON.
type Json = any;

export type PathSeg = string | number;

export interface PropertyOption {
  name: string;
  description: string;
  required: boolean;
}

export interface ValueOption {
  /** JSON text to insert. */
  insert: string;
  label: string;
}

export interface SnippetOption {
  label: string;
  detail: string;
  /** CodeMirror snippet template (`${1}` fields, tab-indented lines). */
  template: string;
}

/**
 * The schema spots the value at `path` may follow. `typeAt(k)` is the `type`
 * property of the object reached after `k` segments, used to pick the right
 * entry form at each level.
 */
export function resolvePath(
  idx: SchemaIndex,
  root: SchemaLoc,
  path: PathSeg[],
  typeAt: (depth: number) => string | undefined = () => undefined,
): SchemaLoc[] {
  let cands: SchemaLoc[] = [root];
  for (let k = 0; k < path.length && cands.length; k++) {
    const seg = path[k];
    const next: SchemaLoc[] = [];
    for (const c of expandAll(idx, cands, typeAt(k))) {
      const node = idx.at(c);
      if (typeof seg === 'number') {
        if (Array.isArray(node?.prefixItems) && seg < node.prefixItems.length)
          next.push(idx.child(c, 'prefixItems', seg));
        else if (node?.items !== undefined && node.items !== false)
          next.push(idx.child(c, 'items'));
        continue;
      }
      const s = idx.shape(c);
      const prop = s.properties.get(seg);
      if (prop) {
        next.push(prop.loc);
        continue;
      }
      const pat = s.patterns.find((p) => p.re.test(seg));
      if (pat) next.push(pat.loc);
      else if (s.additional !== true && s.additional !== false)
        next.push(s.additional);
    }
    cands = unique(next);
  }
  return cands;
}

/**
 * The concrete forms a spot can take: `$ref`s followed and anyOf/oneOf
 * opened, keeping only the forms whose `type` matches `typeHint` when any do.
 */
export function expand(
  idx: SchemaIndex,
  loc: SchemaLoc,
  typeHint?: string,
): SchemaLoc[] {
  const out: SchemaLoc[] = [];
  const seen = new Set<string>();
  const visit = (l: SchemaLoc, depth: number) => {
    const d = idx.deref(l);
    if (!d || depth > 8) return;
    const key = locId(d);
    if (seen.has(key)) return;
    seen.add(key);
    const ch = idx.choices(d);
    if (!ch) {
      out.push(d);
      return;
    }
    let alts = ch;
    if (typeHint) {
      const named = ch.filter((c) => idx.shape(c).discriminator?.has(typeHint));
      if (named.length) alts = named;
    }
    for (const a of alts) visit(a, depth + 1);
    // Properties beside the anyOf apply to every form.
    if (idx.shape(d).properties.size) out.push(d);
  };
  visit(loc, 0);
  return out;
}

function expandAll(
  idx: SchemaIndex,
  locs: SchemaLoc[],
  typeHint?: string,
): SchemaLoc[] {
  return unique(locs.flatMap((l) => expand(idx, l, typeHint)));
}

/** Property names an object at these spots may have, minus those present. */
export function propertyOptions(
  idx: SchemaIndex,
  objectLocs: SchemaLoc[],
  typeHint: string | undefined,
  present: ReadonlySet<string>,
): PropertyOption[] {
  const byName = new Map<string, PropertyOption>();
  const forms = expandAll(idx, objectLocs, typeHint);
  // A form that needs a `_` key the object lacks (the `_copy` form of a spell
  // being written from scratch) still offers its properties, but doesn't make
  // any of them required.
  const fits = (c: SchemaLoc) =>
    [...idx.shape(c).required].every(
      (r) => !r.startsWith('_') || present.has(r),
    );
  const anyFits = forms.some(fits);
  for (const c of forms) {
    const s = idx.shape(c);
    const counts = !anyFits || fits(c);
    for (const [name, p] of s.properties) {
      if (present.has(name)) continue;
      const prev = byName.get(name);
      const required = counts && s.required.has(name);
      if (!prev)
        byName.set(name, { name, description: p.description, required });
      else {
        prev.required ||= required;
        prev.description ||= p.description;
      }
    }
  }
  return [...byName.values()].sort(
    (a, b) =>
      Number(b.required) - Number(a.required) ||
      rank(a.name) - rank(b.name) ||
      a.name.localeCompare(b.name),
  );
}

// The properties every 5etools object leads with.
const LEAD = ['name', 'type', 'source', 'page'];
const rank = (k: string) => {
  const i = LEAD.indexOf(k);
  return i === -1 ? LEAD.length : i;
};

/** Literal values allowed at these spots: enum and const values, booleans. */
export function valueOptions(
  idx: SchemaIndex,
  valueLocs: SchemaLoc[],
): ValueOption[] {
  const vals = new Map<string, ValueOption>();
  const add = (v: unknown) => {
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      const insert = JSON.stringify(v);
      if (!vals.has(insert)) vals.set(insert, { insert, label: String(v) });
    }
  };
  for (const c of expandAll(idx, valueLocs)) {
    const node = idx.at(c);
    if (!node || typeof node !== 'object') continue;
    if ('const' in node) add(node.const);
    if (Array.isArray(node.enum)) node.enum.forEach(add);
    if (idx.types(c).has('boolean') && !node.enum && !('const' in node)) {
      add(true);
      add(false);
    }
    // Free strings whose description lists the usual codes ("- A: Abjuration").
    if (
      !node.enum &&
      !('const' in node) &&
      typeof node.description === 'string'
    )
      for (const m of node.description.matchAll(/^- ([^\s:]+): (.+)$/gm)) {
        const insert = JSON.stringify(m[1]);
        if (!vals.has(insert))
          vals.set(insert, { insert, label: `${m[1]} (${m[2].trim()})` });
      }
    if (vals.size > 300) break;
  }
  return [...vals.values()];
}

/**
 * Snippets for a new value at these spots: one per object form, built from
 * its required properties. For an entry that's one per entry type; for an
 * item in a top-level array, the entity and its `_copy` form.
 */
export function snippetOptions(
  idx: SchemaIndex,
  valueLocs: SchemaLoc[],
  opts: { defaultSource?: string; noun?: string } = {},
): SnippetOption[] {
  const out: SnippetOption[] = [];
  const seen = new Set<string>();
  for (const c of expandAll(idx, valueLocs)) {
    if (!idx.types(c).has('object') && idx.types(c).size) continue;
    const s = idx.shape(c);
    const disc = s.discriminator?.size === 1 ? [...s.discriminator][0] : null;
    if (!disc && !s.required.size) continue;
    const isCopy = s.required.has('_copy');
    // No spaces: CodeMirror restarts matching after one, so typing
    // "new item" would leave "new " in the text.
    const label = disc
      ? disc
      : `${opts.noun ?? 'object'}${isCopy ? '_copy' : ''}`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({
      label,
      detail: disc ? 'entry' : isCopy ? 'template: _copy of one' : 'template',
      template: skeleton(idx, c, disc, opts.defaultSource),
    });
  }
  return out.sort((a, b) =>
    a.detail === b.detail ? a.label.localeCompare(b.label) : 0,
  );
}

function skeleton(
  idx: SchemaIndex,
  loc: SchemaLoc,
  disc: string | null,
  defaultSource?: string,
): string {
  const s = idx.shape(loc);
  const keys = [...s.required];
  if (disc && !keys.includes('type')) keys.unshift('type');
  keys.sort((a, b) => rank(a) - rank(b));
  let field = 1;
  const lines = keys.map((k) => {
    const prop = s.properties.get(k);
    let v: string;
    if (k === 'type' && disc) v = JSON.stringify(disc);
    else if (k === 'source' && defaultSource)
      v = `"\${${field++}:${escapeField(defaultSource)}}"`;
    else v = valueTemplate(idx, prop?.loc, field++);
    return `\t${JSON.stringify(k)}: ${v}`;
  });
  if (!lines.length) return `{\${1}}`;
  return `{\n${lines.join(',\n')}\n}`;
}

function valueTemplate(
  idx: SchemaIndex,
  loc: SchemaLoc | undefined,
  n: number,
): string {
  if (!loc) return `\${${n}}`;
  const d = idx.deref(loc);
  const node: Json = d && idx.at(d);
  if (node && 'const' in node) return JSON.stringify(node.const);
  if (Array.isArray(node?.enum) && node.enum.length)
    return typeof node.enum[0] === 'string'
      ? `"\${${n}:${escapeField(node.enum[0])}}"`
      : `\${${n}:${escapeField(JSON.stringify(node.enum[0]))}}`;
  const t = idx.types(loc);
  // The first listed type wins: a string-or-object `entry` starts as a string.
  if (t.has('string')) return `"\${${n}}"`;
  if (t.has('array')) return `[\${${n}}]`;
  if (t.has('integer') || t.has('number')) return `\${${n}:0}`;
  if (t.has('boolean')) return `\${${n}:false}`;
  if (t.has('object')) return `{\${${n}}}`;
  return `\${${n}}`;
}

const escapeField = (s: string) => s.replace(/[\\}]/g, (c) => `\\${c}`);

function unique(locs: SchemaLoc[]): SchemaLoc[] {
  const seen = new Set<string>();
  return locs.filter((l) => {
    const k = locId(l);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
