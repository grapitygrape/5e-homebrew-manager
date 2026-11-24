/**
 * engine/audit/schema-walk.ts — walk a value beside its schema, one ajv call
 * per spot, descending only into what fails (see HOW in schema-validate.ts).
 * Turns ajv's single first error into one issue per bad value.
 */
import type Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { escapePointer } from './schema.ts';
import {
  allowsType,
  locId,
  type SchemaIndex,
  type SchemaLoc,
} from './schema-shape.ts';
import {
  issue,
  listOf,
  toIssue,
  typeIssue,
  type SchemaIssue,
} from './schema-messages.ts';

// Schema nodes are arbitrary JSON.
type Json = any;

const MAX_DEPTH = 64;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

export function makeWalker(
  ajv: InstanceType<typeof Ajv2020>,
  idx: SchemaIndex,
) {
  const fns = new Map<string, ValidateFunction | null>();
  const fnFor = (loc: SchemaLoc): ValidateFunction | null => {
    const id = locId(loc);
    if (!fns.has(id)) {
      let fn: ValidateFunction | null = null;
      try {
        fn = (ajv.getSchema(id) as ValidateFunction | undefined) ?? null;
      } catch {
        fn = null; // a spot ajv can't compile on its own: don't descend into it
      }
      fns.set(id, fn);
    }
    return fns.get(id)!;
  };
  const passes = (loc: SchemaLoc, data: unknown): boolean => {
    const fn = fnFor(loc);
    return fn ? (fn(data) as boolean) : true;
  };

  function check(
    loc: SchemaLoc,
    data: unknown,
    ptr: string,
    depth: number,
  ): SchemaIssue[] {
    const fn = fnFor(loc);
    if (!fn || fn(data)) return [];
    const first = [...(fn.errors ?? [])];
    if (depth > MAX_DEPTH) return leaf(first, ptr);

    const d = idx.deref(loc);
    const node: Json = d && idx.at(d);
    if (!d || node === undefined) return leaf(first, ptr);
    if (node === false)
      return [issue(ptr, 'false schema', 'This value is not allowed here.')];
    if (!node || typeof node !== 'object') return leaf(first, ptr);

    const out: SchemaIssue[] = [];

    // A $ref beside other keywords: both apply.
    const target = idx.ref(d);
    if (target) out.push(...check(target, data, ptr, depth + 1));
    if (Array.isArray(node.allOf))
      node.allOf.forEach((_: Json, i: number) =>
        out.push(...check(idx.child(d, 'allOf', i), data, ptr, depth + 1)),
      );
    for (const key of ['anyOf', 'oneOf'] as const) {
      if (!Array.isArray(node[key])) continue;
      const alts: SchemaLoc[] = node[key].map((_: Json, i: number) =>
        idx.child(d, key, i),
      );
      const passing = alts.filter((a) => passes(a, data)).length;
      if (!passing) out.push(...closest(alts, data, ptr, depth));
      else if (key === 'oneOf' && passing > 1)
        out.push(issue(ptr, 'oneOf', 'Matches more than one allowed form.'));
    }
    if (node.if !== undefined) {
      const branch = passes(idx.child(d, 'if'), data) ? 'then' : 'else';
      if (node[branch] !== undefined)
        out.push(...check(idx.child(d, branch), data, ptr, depth + 1));
    }
    if (node.not !== undefined && passes(idx.child(d, 'not'), data))
      out.push(issue(ptr, 'not', 'This value is not allowed here.'));

    // This spot's own type: a wrong one makes the rest meaningless.
    const own = ownTypes(node);
    if (own && !allowsType(own, data)) return [...out, typeIssue(ptr, own)];

    if (isObject(data)) {
      for (const r of node.required ?? [])
        if (!(r in data))
          out.push(issue(ptr, 'required', `Missing required property "${r}".`));
      const props = node.properties ?? {};
      const patterns = Object.keys(node.patternProperties ?? {});
      for (const [k, v] of Object.entries(data)) {
        const at = `${ptr}/${escapePointer(k)}`;
        if (k in props) {
          out.push(...check(idx.child(d, 'properties', k), v, at, depth + 1));
          continue;
        }
        const hits = patterns.filter((p) => safeTest(p, k));
        for (const p of hits)
          out.push(
            ...check(idx.child(d, 'patternProperties', p), v, at, depth + 1),
          );
        if (hits.length) continue;
        if (node.additionalProperties === false)
          out.push({
            pointer: at,
            atKey: true,
            keyword: 'additionalProperties',
            message: `Unknown property "${k}".`,
          });
        else if (isObject(node.additionalProperties))
          out.push(
            ...check(idx.child(d, 'additionalProperties'), v, at, depth + 1),
          );
      }
    }
    if (Array.isArray(data)) {
      const prefix = Array.isArray(node.prefixItems)
        ? node.prefixItems.length
        : 0;
      (data as unknown[]).forEach((v, i) => {
        const at = `${ptr}/${i}`;
        if (i < prefix)
          out.push(...check(idx.child(d, 'prefixItems', i), v, at, depth + 1));
        else if (node.items !== undefined)
          out.push(...check(idx.child(d, 'items'), v, at, depth + 1));
      });
    }

    // Nothing below failed: the problem is this value itself (an enum, a
    // pattern, too few items…). ajv's first error names it.
    return out.length ? out : leaf(first, ptr);
  }

  /** Check a value against the anyOf/oneOf alternative it was most likely meant as. */
  function closest(
    alts: SchemaLoc[],
    data: unknown,
    ptr: string,
    depth: number,
  ): SchemaIssue[] {
    const typed = alts.filter((a) => allowsType(idx.types(a), data));
    if (!typed.length) {
      const want = new Set<string>();
      for (const a of alts) idx.types(a).forEach((t) => want.add(t));
      return [typeIssue(ptr, want)];
    }
    let cands = typed;
    if (isObject(data) && typeof data.type === 'string') {
      const discs = typed.map((a) => idx.shape(a).discriminator);
      const named = typed.filter((_, i) => discs[i]?.has(data.type as string));
      if (named.length) cands = named;
      else {
        const open = typed.filter((_, i) => !discs[i]);
        if (!open.length) {
          const allowed = new Set<string>();
          for (const s of discs) s?.forEach((t) => allowed.add(t));
          const near = nearest(data.type, allowed);
          return [
            issue(
              `${ptr}/type`,
              'enum',
              near
                ? `Unknown type ${JSON.stringify(data.type)}. Did you mean "${near}"?`
                : `Unknown type ${JSON.stringify(data.type)}. Must be one of ${listOf([...allowed].sort())}.`,
            ),
          ];
        }
        cands = open;
      }
    }
    const best =
      cands.length === 1
        ? cands[0]
        : cands
            .map((a, i) => ({ a, i, s: shallowMisses(a, data) }))
            .sort((x, y) => x.s - y.s || x.i - y.i)[0].a;
    return check(best, data, ptr, depth + 1);
  }

  /** Missing required + unknown keys at the top of an alternative, without validating. */
  function shallowMisses(loc: SchemaLoc, data: unknown): number {
    if (!isObject(data)) return 0;
    const s = idx.shape(loc);
    let n = 0;
    // A missing `_copy` (or other `_` key) means this isn't that form at all:
    // a half-written spell is a spell, not a copy of one.
    for (const r of s.required)
      if (!(r in data)) n += r.startsWith('_') ? 100 : 1;
    if (s.additional === false)
      for (const k of Object.keys(data))
        if (!s.properties.has(k) && !s.patterns.some((p) => p.re.test(k))) n++;
    return n;
  }

  // Issues per (schema spot, value), with pointers relative to the value.
  const memo = new Map<string, SchemaIssue[]>();
  function cached(loc: SchemaLoc, data: unknown, ptr: string): SchemaIssue[] {
    const key = `${locId(loc)}\u0000${JSON.stringify(data)}`;
    let rel = memo.get(key);
    if (!rel) {
      rel = check(loc, data, '', 2);
      if (memo.size >= MEMO_MAX) memo.clear();
      memo.set(key, rel);
    }
    return rel.map((i) => ({ ...i, pointer: ptr + i.pointer }));
  }

  return { check, cached };
}

export type Walker = ReturnType<typeof makeWalker>;
const MEMO_MAX = 50_000;

function ownTypes(node: Json): Set<string> | null {
  const t = node.type;
  if (typeof t === 'string') return new Set([t]);
  if (Array.isArray(t)) return new Set(t);
  return null;
}

/** The allowed value within two edits of a typo, if there's exactly one best. */
function nearest(typo: string, allowed: Iterable<string>): string | null {
  let best: string | null = null;
  let bestD = 3;
  for (const a of allowed) {
    const d = editDistance(typo.toLowerCase(), a.toLowerCase());
    if (d < bestD) [best, bestD] = [a, d];
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]++;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = cur;
    }
  }
  return row[b.length];
}

function safeTest(pattern: string, key: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(key);
  } catch {
    return false;
  }
}

/** ajv's first error, re-based onto `ptr`. Combinator summaries are skipped. */
function leaf(errors: ErrorObject[], ptr: string): SchemaIssue[] {
  const real = errors.filter(
    (e) => !['anyOf', 'oneOf', 'if'].includes(e.keyword),
  );
  if (!real.length)
    return [issue(ptr, 'anyOf', "Doesn't match any allowed form.")];
  const own = real.find((e) => e.instancePath === '');
  const pick =
    own ??
    real.reduce((a, b) =>
      b.instancePath.length > a.instancePath.length ? b : a,
    );
  return [toIssue({ ...pick, instancePath: ptr + pick.instancePath })];
}
