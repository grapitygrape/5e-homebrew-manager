/**
 * engine/audit/schema-shape.ts — find your way around the brew JSON Schemas
 * without validating: follow `$ref`s, step into a property or array item, and
 * read what an object at a spot may contain.
 *
 * INTENT
 *   Two consumers need the same walking: the schema validator (to split a
 *   failure into one issue per bad value) and the parser's autocomplete (to
 *   list the properties and values allowed at the cursor). Pure; it only reads
 *   the loaded SchemaMap.
 *
 * LOCATIONS
 *   A spot in the schemas is `{ root, pointer }`: `root` is the id ajv knows the
 *   file by (its `$id`, else its path in the folder), `pointer` a JSON pointer
 *   inside it. `locId` turns one into the `file#/pointer` string ajv's
 *   getSchema takes.
 */
import {
  escapePointer,
  parseSchemaRef,
  walkPointer,
  type SchemaMap,
} from './schema.ts';

// Schema nodes are arbitrary JSON.
type Json = any;

export interface SchemaLoc {
  root: string;
  pointer: string;
}

/** What an object at a spot may contain, merged across `allOf` and `$ref`. */
export interface ObjectShape {
  properties: Map<string, { loc: SchemaLoc; description: string }>;
  required: Set<string>;
  patterns: { re: RegExp; loc: SchemaLoc }[];
  /** false: no other keys; a loc: other keys follow that schema; true: anything. */
  additional: false | true | SchemaLoc;
  /** Values the object's `type` property may take, if it's constrained. */
  discriminator: Set<string> | null;
}

export interface SchemaIndex {
  /** The schema node at a location, or undefined if it doesn't resolve. */
  at(loc: SchemaLoc): Json;
  /** Follow `$ref`s (and plain `$ref` wrappers) to the schema that does the work. */
  deref(loc: SchemaLoc): SchemaLoc | null;
  /** Where the `$ref` at a location points, or null (none, remote, or missing). */
  ref(loc: SchemaLoc): SchemaLoc | null;
  /** A child location: `child(loc, 'properties', 'name')`. */
  child(loc: SchemaLoc, ...segs: (string | number)[]): SchemaLoc;
  /** The JSON types a spot allows (empty: any). Follows $ref and choices. */
  types(loc: SchemaLoc): Set<string>;
  /** The alternatives of an anyOf/oneOf at a spot (after deref), or null. */
  choices(loc: SchemaLoc): SchemaLoc[] | null;
  /** Merged object shape at a spot (after deref, through allOf). */
  shape(loc: SchemaLoc): ObjectShape;
}

export const locId = ({ root, pointer }: SchemaLoc): string =>
  `${root}#${pointer
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')}`;

/** Index a SchemaMap by every name a `$ref` might use for each file. */
export function createSchemaIndex(schemas: SchemaMap): SchemaIndex {
  const byId = new Map<string, Json>();
  for (const [rel, schema] of Object.entries(schemas)) {
    if (!schema || typeof schema !== 'object') continue;
    byId.set(rel, schema);
    if (typeof schema.$id === 'string' && !byId.has(schema.$id))
      byId.set(schema.$id, schema);
  }
  const rootIdOf = (rel: string): string => {
    const s = byId.get(rel);
    return typeof s?.$id === 'string' ? s.$id : rel;
  };

  const at = (loc: SchemaLoc): Json =>
    walkPointer(byId.get(loc.root), loc.pointer);

  // `$ref` resolves against the current schema's path via the shared parser.
  const resolveRef = (from: SchemaLoc, ref: string): SchemaLoc | null => {
    const parsed = parseSchemaRef(ref, from.root);
    if (!parsed) return null;
    const root = parsed.rawFile
      ? rootIdOf(byId.has(parsed.file) ? parsed.file : parsed.rawFile)
      : from.root;
    if (!byId.has(root)) return null;
    return { root, pointer: parsed.pointer };
  };

  const child = (loc: SchemaLoc, ...segs: (string | number)[]): SchemaLoc => ({
    root: loc.root,
    pointer: loc.pointer + segs.map((s) => `/${escapePointer(String(s))}`).join(''),
  });

  const deref = (loc: SchemaLoc): SchemaLoc | null => {
    let cur: SchemaLoc | null = loc;
    for (let hops = 0; cur && hops < 32; hops++) {
      const node = at(cur);
      if (node === undefined) return null;
      if (!node || typeof node !== 'object' || typeof node.$ref !== 'string')
        return cur;
      // A $ref with its own constraints next to it is kept as is: shape()
      // and the validator treat the pair like an allOf.
      if (Object.keys(node).some((k) => VALIDATING.has(k))) return cur;
      cur = resolveRef(cur, node.$ref);
    }
    return cur;
  };

  const parts = (loc: SchemaLoc): SchemaLoc[] => {
    // The schema itself, the target of a $ref next to other keywords, and allOf members.
    const out: SchemaLoc[] = [];
    const seen = new Set<string>();
    const visit = (l: SchemaLoc | null, depth: number) => {
      if (!l || depth > 16) return;
      const d = deref(l);
      if (!d) return;
      const key = locId(d);
      if (seen.has(key)) return;
      seen.add(key);
      const node = at(d);
      if (!node || typeof node !== 'object') return;
      out.push(d);
      if (typeof node.$ref === 'string')
        visit(resolveRef(d, node.$ref), depth + 1);
      if (Array.isArray(node.allOf))
        node.allOf.forEach((_: Json, i: number) =>
          visit(child(d, 'allOf', i), depth + 1),
        );
    };
    visit(loc, 0);
    return out;
  };

  const choices = (loc: SchemaLoc): SchemaLoc[] | null => {
    const d = deref(loc);
    const node = d && at(d);
    if (!d || !node || typeof node !== 'object') return null;
    for (const k of ['anyOf', 'oneOf'] as const)
      if (Array.isArray(node[k]))
        return node[k].map((_: Json, i: number) => child(d, k, i));
    return null;
  };

  const types = (loc: SchemaLoc, depth = 0): Set<string> => {
    const out = new Set<string>();
    if (depth > 8) return out;
    for (const p of parts(loc)) {
      const node = at(p);
      if (typeof node.type === 'string') out.add(node.type);
      else if (Array.isArray(node.type))
        node.type.forEach((t: string) => out.add(t));
      const ch = choices(p);
      if (ch && !node.type)
        for (const c of ch) {
          const t = types(c, depth + 1);
          if (!t.size) return new Set(); // one alternative allows anything
          t.forEach((x) => out.add(x));
        }
    }
    if (out.has('number')) out.add('integer');
    return out;
  };

  const shape = (loc: SchemaLoc): ObjectShape => {
    const s = ownShape(loc);
    s.discriminator = discriminator(loc, s, 0);
    return s;
  };

  const ownShape = (loc: SchemaLoc): ObjectShape => {
    const s: ObjectShape = {
      properties: new Map(),
      required: new Set(),
      patterns: [],
      additional: true,
      discriminator: null,
    };
    for (const p of parts(loc)) {
      const node = at(p);
      for (const [k, v] of Object.entries(node.properties ?? {})) {
        if (!s.properties.has(k))
          s.properties.set(k, {
            loc: child(p, 'properties', k),
            description: describe(v),
          });
      }
      for (const r of node.required ?? []) s.required.add(r);
      for (const pat of Object.keys(node.patternProperties ?? {})) {
        try {
          s.patterns.push({
            re: new RegExp(pat, 'u'),
            loc: child(p, 'patternProperties', pat),
          });
        } catch {
          /* a pattern JS can't compile: skip it */
        }
      }
      if (node.additionalProperties === false) s.additional = false;
      else if (
        node.additionalProperties &&
        typeof node.additionalProperties === 'object' &&
        s.additional === true
      )
        s.additional = child(p, 'additionalProperties');
    }
    return s;
  };

  // The `type` values an object here may have: from its own `type` property,
  // or, if it's a choice (entryItem is a oneOf of two forms), from every
  // alternative. Null when some alternative doesn't constrain `type`.
  const discriminator = (
    loc: SchemaLoc,
    s: ObjectShape,
    depth: number,
  ): Set<string> | null => {
    const typeProp = s.properties.get('type');
    if (typeProp) {
      const d = deref(typeProp.loc);
      const t = d && at(d);
      if (t && typeof t.const === 'string') return new Set([t.const]);
      if (t && Array.isArray(t.enum))
        return new Set(t.enum.filter((v: unknown) => typeof v === 'string'));
    }
    const ch = choices(loc);
    if (!ch || depth > 4) return null;
    const out = new Set<string>();
    for (const c of ch) {
      const sub = discriminator(c, ownShape(c), depth + 1);
      if (!sub) return null;
      sub.forEach((v) => out.add(v));
    }
    return out.size ? out : null;
  };

  const ref = (loc: SchemaLoc): SchemaLoc | null => {
    const node = at(loc);
    return node && typeof node.$ref === 'string'
      ? resolveRef(loc, node.$ref)
      : null;
  };

  return { at, deref, ref, child, types, choices, shape };
}

// Keywords that constrain a value (so a $ref beside them isn't a plain alias).
const VALIDATING = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'items',
  'prefixItems',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'allOf',
  'not',
  'if',
  'minItems',
  'maxItems',
  'uniqueItems',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'unevaluatedProperties',
]);

function describe(node: Json): string {
  if (!node || typeof node !== 'object') return '';
  const d = node.description ?? node.markdownDescription ?? node.title ?? '';
  return typeof d === 'string' ? d : '';
}

/** JSON type name of a value, as JSON Schema counts them. */
export function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v; // string, boolean, object
}

/** Does a set from `types()` allow this value? An empty set allows anything. */
export function allowsType(types: Set<string>, v: unknown): boolean {
  if (!types.size) return true;
  const t = jsonType(v);
  return types.has(t) || (t === 'integer' && types.has('number'));
}
