/**
 * engine/audit/schema.ts — 5etools brew JSON-Schema introspection (pure).
 *
 * INTENT
 *   Given a map of loaded schema files and a root `$ref`, return the *primary
 *   top-level properties* of that entity (name, type, description, required) —
 *   and nothing deeper. Sub-property shapes belong in the guides' JSON examples,
 *   not the property audit.
 *
 *   Pure, so it runs identically on server and in the browser: it takes the
 *   already-loaded `{ relPath: schemaJson }` map (`DataSource.getSchemas()`).
 *
 * REUSE NOTES
 *   - Used by audit.ts (coverage) and the validator's schema endpoint. Keeping
 *     "what counts as a property" here means audit and validator never disagree.
 *   - Also owns the shared JSON-Pointer (`escapePointer`, `unescapePointer`,
 *     `walkPointer`) and relative `$ref` (`parseSchemaRef`) primitives reused
 *     by `schema-shape.ts`, `schema-validate.ts` and `schema-walk.ts`.
 */

// Schema nodes are arbitrary JSON; `any` is intentional for ergonomic walking.
type Json = any;
export type SchemaMap = Record<string, Json>;

export interface PropertyInfo {
  type: string;
  description: string;
  required?: boolean;
}

export interface RefInfo {
  schema: Json;
  file: string;
}

const STRUCTURAL_KEYS = new Set([
  '$schema',
  'version',
  'fileType',
  'siteVersion',
]);

/**
 * A `_copy` escape-hatch branch (e.g. `{"required": ["_copy"]}`) lets an entity be a
 * copy INSTEAD of a full definition. It is not an alternative *shape* of the entity,
 * so both required-field intersection and branch decomposition must skip it.
 */
function isCopyOnlyBranch(b: Json): boolean {
  return (
    !!b &&
    typeof b === 'object' &&
    Array.isArray(b.required) &&
    b.required.length > 0 &&
    b.required.every((r: unknown) => String(r).startsWith('_'))
  );
}

// --- shared JSON-Pointer & posix `$ref` helpers (browser-safe, no node:path) -

export function escapePointer(seg: string): string {
  return seg.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointer(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~');
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function joinRel(dir: string, rel: string): string {
  const segs = (dir ? dir.split('/') : []).concat(rel.split('/'));
  const out: string[] = [];
  for (const seg of segs) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

/** Walk a JSON pointer (`/a/b/0`) from `root`, unescaping RFC 6901 tokens. */
export function walkPointer(root: Json, pointer: string): Json {
  if (!pointer) return root;
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return root;
  let curr: Json = root;
  for (const seg of trimmed.split('/')) {
    if (curr == null || typeof curr !== 'object') return undefined;
    curr = curr[unescapePointer(seg)];
  }
  return curr;
}

/** Split a local `$ref` into its resolved relative file path and JSON pointer. */
export function parseSchemaRef(
  ref: string,
  currentFile: string,
): { file: string; rawFile: string; pointer: string } | null {
  if (!ref || typeof ref !== 'string' || /^https?:\/\//.test(ref)) return null;
  const hash = ref.indexOf('#');
  const rawFile = hash === -1 ? ref : ref.slice(0, hash);
  const rawPointer = hash === -1 ? '' : ref.slice(hash + 1);
  const file = rawFile
    ? joinRel(dirname(currentFile), decodeURIComponent(rawFile))
    : currentFile;
  return {
    file,
    rawFile,
    pointer: rawPointer ? decodeURIComponent(rawPointer) : '',
  };
}

/** Resolve a `$ref` (cross-file or local) to `{ schema, file }`, or null. */
export function resolveRef(
  ref: string,
  currentFile: string,
  schemas: SchemaMap,
): RefInfo | null {
  const parsed = parseSchemaRef(ref, currentFile);
  if (!parsed) return null;

  let filePart = parsed.file;
  if (parsed.rawFile && !schemas[filePart] && schemas[parsed.rawFile]) {
    filePart = parsed.rawFile;
  }

  const targetSchema = schemas[filePart];
  if (!targetSchema) return null;

  const curr = walkPointer(targetSchema, parsed.pointer);
  return curr === undefined ? null : { schema: curr, file: filePart };
}

/** Summarize a property schema into a readable `{ type, description }`. */
export function describeProperty(
  propSchema: Json,
  schemas: SchemaMap,
  file: string,
): PropertyInfo {
  if (!propSchema || typeof propSchema !== 'object')
    return { type: 'unknown', description: '' };

  let type: string = propSchema.type || 'unknown';
  let description: string = propSchema.description || '';

  if (propSchema.$ref) {
    const resolved = resolveRef(propSchema.$ref, file, schemas);
    if (resolved?.schema) {
      if (!description) description = resolved.schema.description || '';
      if (type === 'unknown') type = resolved.schema.type || 'unknown';
    }
  }

  if (type === 'array' && propSchema.items) {
    let itemType: string = propSchema.items.type || 'unknown';
    if (propSchema.items.$ref) {
      const resolved = resolveRef(propSchema.items.$ref, file, schemas);
      if (resolved?.schema) itemType = resolved.schema.type || itemType;
    }
    type = `array of ${itemType}s`;
  }

  if (type === 'unknown') {
    for (const comb of ['anyOf', 'oneOf', 'allOf'] as const) {
      if (Array.isArray(propSchema[comb])) {
        const types = propSchema[comb]
          .map((s: Json) => s && s.type)
          .filter(Boolean);
        if (types.length) {
          type = [...new Set<string>(types)].join(' | ');
          break;
        }
      }
    }
  }

  return { type, description: description.replace(/\s+/g, ' ').trim() };
}

/**
 * Collect ONLY the top-level properties of an entity schema. Follows `$ref` and
 * object-level combiners (allOf/anyOf/oneOf) — because 5etools entities compose
 * their property set from a shared base — but never recurses into a property's
 * value, `items`, `patternProperties`, or `$defs`.
 */
export function collectTopLevelProperties(
  rootRefInfo: RefInfo,
  schemas: SchemaMap,
): { properties: Record<string, PropertyInfo>; required: Set<string> } {
  const properties: Record<string, PropertyInfo> = {};
  const visited = new WeakSet<object>();

  // Collect the *property surface* (union of everything reachable). Showing all
  // possible properties is the right behaviour even for branch-based schemas.
  function visitProps(info: RefInfo | null): void {
    if (!info || !info.schema || typeof info.schema !== 'object') return;
    const { schema, file } = info;
    if (visited.has(schema)) return;
    visited.add(schema);

    if (schema.$ref) visitProps(resolveRef(schema.$ref, file, schemas));

    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, value] of Object.entries(schema.properties)) {
        if (STRUCTURAL_KEYS.has(key)) continue;
        const info2 = describeProperty(value, schemas, file);
        if (!properties[key] || properties[key].type === 'unknown')
          properties[key] = info2;
      }
    }

    for (const comb of ['allOf', 'anyOf', 'oneOf'] as const) {
      if (Array.isArray(schema[comb]))
        for (const branch of schema[comb]) visitProps({ schema: branch, file });
    }
  }

  // Compute `required` combiner-aware: own + allOf are unioned (all apply);
  // anyOf/oneOf are INTERSECTED (only one branch applies, so a field is required
  // only if EVERY branch requires it). Unioning anyOf branches (the old bug)
  // over-requires — e.g. a `magicvariant` would be told it needs both top-level
  // `rarity` (brew-root branch) AND `_copy` (copy branch), neither universally true.
  function computeRequired(
    info: RefInfo | null,
    seen: Set<object>,
  ): Set<string> {
    if (!info || !info.schema || typeof info.schema !== 'object')
      return new Set();
    const { schema, file } = info;
    if (seen.has(schema)) return new Set();
    seen.add(schema);

    const out = new Set<string>();
    if (schema.$ref) {
      const r = resolveRef(schema.$ref, file, schemas);
      if (r) for (const x of computeRequired(r, seen)) out.add(x);
    }
    if (Array.isArray(schema.required)) {
      for (const r of schema.required)
        if (!STRUCTURAL_KEYS.has(r) && !String(r).startsWith('_')) out.add(r);
    }
    if (Array.isArray(schema.allOf)) {
      for (const branch of schema.allOf)
        for (const x of computeRequired({ schema: branch, file }, seen))
          out.add(x);
    }
    for (const comb of ['anyOf', 'oneOf'] as const) {
      const branches = schema[comb];
      if (Array.isArray(branches) && branches.length) {
        // Drop copy-only branches (see isCopyOnlyBranch — intersecting one would
        // wipe out every required field, the original anyOf `_copy` bug), then
        // intersect the remaining real branches.
        const real = (branches as Json[]).filter((b) => !isCopyOnlyBranch(b));
        const chosen: Json[] = real.length ? real : (branches as Json[]);
        // Each branch gets its own `seen` so shared sub-schemas aren't skipped.
        const sets: Set<string>[] = chosen.map((b) =>
          computeRequired({ schema: b, file }, new Set(seen)),
        );
        let inter: Set<string> | null = null;
        for (const s of sets)
          inter =
            inter === null
              ? new Set<string>(s)
              : new Set<string>([...inter].filter((x: string) => s.has(x)));
        if (inter) for (const x of inter) out.add(x);
      }
    }
    return out;
  }

  visitProps(rootRefInfo);
  const required = computeRequired(rootRefInfo, new Set());
  for (const name of Object.keys(properties))
    properties[name].required = required.has(name);
  return { properties, required };
}

export interface NamedProperty extends PropertyInfo {
  name: string;
  /** Always set by getEntityProperties (narrows PropertyInfo's optional `required`). */
  required: boolean;
}

/** Shape a `{ name: PropertyInfo }` map into the ordered NamedProperty list. */
function toNamedProperties(
  properties: Record<string, PropertyInfo>,
): NamedProperty[] {
  return Object.entries(properties)
    .map(([name, info]) => ({
      name,
      type: info.type,
      description: info.description,
      required: !!info.required,
    }))
    .sort((a, b) =>
      a.required !== b.required
        ? a.required
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
}

/** Resolve a guide's rootRef → ordered [{ name, type, description, required }]. */
export function getEntityProperties(
  schemas: SchemaMap,
  primarySchemaFile: string,
  rootRef: string,
): NamedProperty[] | null {
  const rootInfo = resolveRef(rootRef, primarySchemaFile, schemas);
  if (!rootInfo) return null;
  const { properties } = collectTopLevelProperties(rootInfo, schemas);
  return toNamedProperties(properties);
}

/**
 * Property names across a guide's related definitions (GuideMapEntry.related),
 * plus any that no longer resolve: an upstream rename the caller should report.
 */
export function getRelatedKeys(
  schemas: SchemaMap,
  refs: { schema: string; rootRef: string }[] = [],
): { keys: Set<string>; unresolved: string[] } {
  const keys = new Set<string>();
  const unresolved: string[] = [];
  for (const r of refs) {
    const props = getEntityProperties(schemas, r.schema, r.rootRef);
    if (!props) unresolved.push(`${r.schema}${r.rootRef}`);
    else for (const p of props) keys.add(p.name);
  }
  return { keys, unresolved };
}

/** One alternative shape of a `oneOf`/`anyOf` entity. */
export interface SchemaBranch {
  /** Branch label — the `$ref`'s last pointer segment, else `branch N`. */
  name: string;
  properties: NamedProperty[];
}

/**
 * Decompose a discriminated-union entity into its alternative shapes.
 *
 * WHY THIS EXISTS
 *   `collectTopLevelProperties` deliberately *unions* every reachable branch. That is
 *   correct for the validator — it must accept any legal property — but wrong for
 *   coverage scoring, which asks "what does one of these actually look like?". For a
 *   6-branch entity like `vehicle`, the union invents a 138-property shape that no
 *   real entity ever has, and a guide is then penalised for not documenting it.
 *   This function gives the audit layer the per-shape view without changing the
 *   union behaviour every other consumer relies on.
 *
 * Returns `null` when the entity is a single shape (fewer than two real branches),
 * so callers can fall back to plain `getEntityProperties`.
 */
export function getEntityBranches(
  schemas: SchemaMap,
  primarySchemaFile: string,
  rootRef: string,
): SchemaBranch[] | null {
  const rootInfo = resolveRef(rootRef, primarySchemaFile, schemas);
  if (!rootInfo) return null;

  // Follow a bare `$ref` chain to the node that actually carries the combiner.
  let info: RefInfo = rootInfo;
  const seen = new Set<object>();
  while (
    info.schema &&
    typeof info.schema === 'object' &&
    info.schema.$ref &&
    !seen.has(info.schema)
  ) {
    seen.add(info.schema);
    const next = resolveRef(info.schema.$ref, info.file, schemas);
    if (!next) break;
    info = next;
  }
  if (!info.schema || typeof info.schema !== 'object') return null;

  const raw: Json[] | undefined = Array.isArray(info.schema.oneOf)
    ? info.schema.oneOf
    : Array.isArray(info.schema.anyOf)
      ? info.schema.anyOf
      : undefined;
  if (!raw) return null;

  const real = raw.filter((b) => !isCopyOnlyBranch(b));
  // One real branch (or none) is not a union — the plain union view is already right.
  if (real.length < 2) return null;

  return real.map((branch, i) => {
    const ref: string | undefined =
      branch && typeof branch === 'object' ? branch.$ref : undefined;
    const name = ref
      ? ref.split('/').pop() || `branch ${i + 1}`
      : `branch ${i + 1}`;
    const { properties } = collectTopLevelProperties(
      { schema: branch, file: info.file },
      schemas,
    );
    return { name, properties: toNamedProperties(properties) };
  });
}
