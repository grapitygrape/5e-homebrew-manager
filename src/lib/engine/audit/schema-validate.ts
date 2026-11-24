/**
 * engine/audit/schema-validate.ts — full JSON-Schema validation of a homebrew
 * file (or a bare entry) against the 5etools-utils brew schemas.
 *
 * INTENT
 *   Report what the homebrew repo's CI (`npm run test:json`, through
 *   5etools-utils' UtilAjv) would reject, with the same ajv setup, but readable
 *   in an editor: one issue per bad value, each pinned to a JSON pointer.
 *
 * HOW
 *   ajv's `allErrors` mode is unusable here: it checks every entry against all
 *   ~46 entry types at every nesting level, which took minutes on a large
 *   class file. So ajv runs in its fast first-error mode, as in the CI, and
 *   this module walks the document beside the schema. Each value is checked
 *   whole first (a valid subtree costs one fast call and is skipped). Only a
 *   failing value is split into its properties or items, and an `anyOf` is
 *   narrowed to the alternative whose `type` matches before going deeper.
 *
 * MODULES
 *   schema-walk.ts does the walk, schema-messages.ts words the issues. This
 *   file builds the ajv instance and checks a brew file's top level.
 *
 * PURE
 *   Takes the already-loaded SchemaMap (`{ relPath: schemaJson }`); no I/O.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import { escapePointer, unescapePointer, type SchemaMap } from './schema.ts';
import {
  createSchemaIndex,
  type SchemaIndex,
  type SchemaLoc,
} from './schema-shape.ts';
import { isObject, makeWalker, type Walker } from './schema-walk.ts';
import { issue, type SchemaIssue } from './schema-messages.ts';

export { escapePointer, unescapePointer };

export type DocumentKind = 'brew' | 'entry';

export interface SchemaValidator {
  /** Array keys the brew schema allows at the top level. */
  brewProps: ReadonlySet<string>;
  /** The schema index, shared with autocomplete. */
  index: SchemaIndex;
  /** The schema a document of this kind is checked against. */
  rootFor(kind: DocumentKind, isArray?: boolean): SchemaLoc;
  validate(doc: unknown, kind: DocumentKind): SchemaIssue[];
}

export const BREW_ROOT = 'homebrew.json';
export const ENTRY_ROOT = 'entry.json';
// Lets a pasted array of entries validate item by item.
const ENTRY_ARRAY_ID = 'hbm-entry-array.json';
const MAX_ISSUES = 500;
const DATE_RE = /^\d\d\d\d-\d\d-\d\d$/;

/**
 * Which schema a pasted document is for. A brew file has `_meta` or a known
 * top-level array key; anything else (an entry object, an array of entries, a
 * string) is an entry, as in the 5etools Renderer Demo.
 */
export function documentKind(
  doc: unknown,
  brewProps: ReadonlySet<string> = new Set(),
): DocumentKind {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 'entry';
  const keys = Object.keys(doc);
  if (keys.includes('_meta')) return 'brew';
  if (keys.some((k) => brewProps.has(k))) return 'brew';
  // Without the schema, a `type` string is the tell of an entry.
  return typeof (doc as Record<string, unknown>).type === 'string'
    ? 'entry'
    : 'brew';
}

/**
 * Build a validator from the brew schema folder. Throws if `homebrew.json` or
 * `entry.json` is missing or doesn't compile; callers fall back to the
 * property checks in validate.ts.
 */
export function createSchemaValidator(loaded: SchemaMap): SchemaValidator {
  const schemas = brewFolder(loaded);
  if (!schemas[BREW_ROOT] || !schemas[ENTRY_ROOT])
    throw new Error(
      `The schema folder has no ${schemas[BREW_ROOT] ? ENTRY_ROOT : BREW_ROOT}.`,
    );

  // Same options and extra keywords as 5etools-utils' UtilAjv.
  const ajv = new Ajv2020({ allowUnionTypes: true, strict: false });
  ajv.addKeyword({ keyword: 'version', validate: false } as never);
  ajv.addKeyword({ keyword: 'markdownDescription', validate: false } as never);
  ajv.addFormat('date', { validate: (s: string) => DATE_RE.test(s) });
  // UtilAjv swaps multipleOf for a float-safe one; this does the same.
  ajv.removeKeyword('multipleOf');
  ajv.addKeyword({
    keyword: 'multipleOf',
    type: 'number',
    errors: false,
    metaSchema: { type: 'number' },
    compile: (m: number) => (data: number) =>
      Math.abs(Math.round(data / m) - data / m) < 1e-9,
  });

  const all: SchemaMap = {
    ...schemas,
    [ENTRY_ARRAY_ID]: {
      $id: ENTRY_ARRAY_ID,
      type: 'array',
      items: { $ref: ENTRY_ROOT },
    },
  };
  for (const [rel, schema] of Object.entries(all))
    if (schema && typeof schema === 'object') ajv.addSchema(schema, rel);
  // Remote refs (Plutonium scene schemas) aren't on disk; accept anything there.
  for (const [url, defs] of remoteRefs(all))
    if (!ajv.getSchema(url))
      ajv.addSchema(
        {
          $id: url,
          $defs: Object.fromEntries([...defs].map((d) => [d, true])),
        },
        url,
      );

  // Compile both roots now so a broken schema folder fails here, not mid-edit.
  const brew = ajv.getSchema(BREW_ROOT);
  const entry = ajv.getSchema(ENTRY_ROOT);
  if (!brew || !entry || !ajv.getSchema(ENTRY_ARRAY_ID))
    throw new Error('The brew schemas did not compile.');

  const index = createSchemaIndex(all);
  const brewProps = new Set(
    Object.keys(schemas[BREW_ROOT].properties ?? {}).filter(
      (k) => !k.startsWith('_') && k !== '$schema',
    ),
  );
  const walker = makeWalker(ajv, index);

  const rootFor = (kind: DocumentKind, isArray = false): SchemaLoc => ({
    root:
      kind === 'brew'
        ? BREW_ROOT
        : isArray
          ? ENTRY_ARRAY_ID
          : rootIdOf(all, ENTRY_ROOT),
    pointer: '',
  });

  return {
    brewProps,
    index,
    rootFor,
    validate(doc, kind) {
      if (kind === 'brew' && isObject(doc))
        return dedupe(checkBrewRoot(index, walker, doc));
      return dedupe(
        walker.check(rootFor('entry', Array.isArray(doc)), doc, '', 0),
      );
    },
  };
}

/**
 * A brew file's top level, checked by hand so each entity can be validated on
 * its own and cached: retyping one spell in a 2 MB file then re-checks one
 * spell, not the file. The top-level arrays only use type, items, minItems and
 * uniqueItems (checked in brew/homebrew.json at utils v0.17.39); anything else
 * goes through the walker.
 */
function checkBrewRoot(
  idx: SchemaIndex,
  walker: Walker,
  doc: Record<string, unknown>,
): SchemaIssue[] {
  const rootLoc: SchemaLoc = { root: BREW_ROOT, pointer: '' };
  const root = idx.at(rootLoc);
  const props = root.properties ?? {};
  const out: SchemaIssue[] = [];
  for (const r of root.required ?? [])
    if (!(r in doc))
      out.push(issue('', 'required', `Missing required property "${r}".`));
  for (const [k, v] of Object.entries(doc)) {
    const at = `/${escapePointer(k)}`;
    if (!(k in props)) {
      if (root.additionalProperties === false)
        out.push({
          pointer: at,
          atKey: true,
          keyword: 'additionalProperties',
          message: `Unknown property "${k}".`,
        });
      continue;
    }
    const propLoc = idx.child(rootLoc, 'properties', k);
    const d = idx.deref(propLoc);
    const node = d && idx.at(d);
    const plainArray =
      d &&
      node &&
      node.type === 'array' &&
      node.items !== undefined &&
      Object.keys(node).every((x) => ARRAY_KEYS.has(x));
    if (!plainArray || !Array.isArray(v)) {
      out.push(...walker.check(propLoc, v, at, 1));
      continue;
    }
    if (typeof node.minItems === 'number' && v.length < node.minItems)
      out.push(
        issue(
          at,
          'minItems',
          `Needs at least ${node.minItems} item${node.minItems === 1 ? '' : 's'}.`,
        ),
      );
    if (node.uniqueItems) out.push(...duplicateItems(v, at));
    const itemLoc = idx.child(d, 'items');
    v.forEach((item, i) =>
      out.push(...walker.cached(itemLoc, item, `${at}/${i}`)),
    );
  }
  return out;
}

const ARRAY_KEYS = new Set([
  'type',
  'items',
  'minItems',
  'uniqueItems',
  'description',
  'markdownDescription',
  'title',
  '$comment',
]);

function duplicateItems(arr: unknown[], at: string): SchemaIssue[] {
  const seen = new Map<string, number>();
  const out: SchemaIssue[] = [];
  arr.forEach((item, i) => {
    const key = stableStringify(item);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else
      out.push(
        issue(
          `${at}/${i}`,
          'uniqueItems',
          `Duplicate of item ${first}; each must be unique.`,
        ),
      );
  });
  return out;
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * The brew schemas keyed from their own folder. Settings may point at
 * `schema/` instead of `schema/brew/`; then the keys carry a `brew/` prefix.
 */
function brewFolder(schemas: SchemaMap): SchemaMap {
  if (schemas[BREW_ROOT]) return schemas;
  const hit = Object.keys(schemas)
    .filter((k) => k.endsWith(`/${BREW_ROOT}`))
    .sort((a, b) => a.length - b.length)[0];
  if (!hit) return schemas;
  const prefix = hit.slice(0, -BREW_ROOT.length);
  return Object.fromEntries(
    Object.entries(schemas)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v]),
  );
}

function rootIdOf(schemas: SchemaMap, rel: string): string {
  const id = schemas[rel]?.$id;
  return typeof id === 'string' ? id : rel;
}

function remoteRefs(schemas: SchemaMap): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = /"\$ref":\s*"(https?:\/\/[^"#]+)(?:#\/\$defs\/([^"/]+))?"/g;
  for (const s of Object.values(schemas))
    for (const m of JSON.stringify(s).matchAll(re)) {
      const defs = out.get(m[1]) ?? out.set(m[1], new Set()).get(m[1])!;
      if (m[2]) defs.add(m[2]);
    }
  return out;
}

function dedupe(issues: SchemaIssue[]): SchemaIssue[] {
  const seen = new Set<string>();
  const out: SchemaIssue[] = [];
  for (const i of issues) {
    const k = `${i.pointer}\u0000${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
}
