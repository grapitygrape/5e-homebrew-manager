/**
 * engine/audit/schema-messages.ts — the SchemaIssue shape, plain-English
 * messages for ajv errors, and JSON-pointer labels for showing where an issue
 * is (`spell` 3, `entries[2].type`).
 */
import type { ErrorObject } from 'ajv';
import { escapePointer, unescapePointer } from './schema.ts';

export interface SchemaIssue {
  /** JSON pointer to the offending value (`/spell/0/entries/2`). */
  pointer: string;
  /** Point at the property *name* rather than its value (unknown properties). */
  atKey: boolean;
  /** Plain text. */
  message: string;
  /** The ajv keyword, for tests and grouping. */
  keyword: string;
}

export function issue(
  pointer: string,
  keyword: string,
  message: string,
): SchemaIssue {
  return { pointer, atKey: false, keyword, message };
}

export function typeIssue(ptr: string, types: Set<string>): SchemaIssue {
  const t = [...types].filter((x) => !(x === 'integer' && types.has('number')));
  return issue(ptr, 'type', `Must be ${t.map(article).join(' or ')}.`);
}

// --- messages ------------------------------------------------------------------

const article = (t: string) => (/^[aeiou]/.test(t) ? `an ${t}` : `a ${t}`);
export const listOf = (vals: unknown[], max = 12): string => {
  const shown = vals.slice(0, max).map((v) => JSON.stringify(v));
  return vals.length > max
    ? `${shown.join(', ')} and ${vals.length - max} more`
    : shown.join(', ');
};

export function toIssue(e: ErrorObject): SchemaIssue {
  const p = e.params as Record<string, any>;
  const base = { pointer: e.instancePath, atKey: false, keyword: e.keyword };
  switch (e.keyword) {
    case 'required':
      return {
        ...base,
        message: `Missing required property "${p.missingProperty}".`,
      };
    case 'additionalProperties':
    case 'unevaluatedProperties': {
      const prop = p.additionalProperty ?? p.unevaluatedProperty;
      return {
        ...base,
        pointer: `${e.instancePath}/${escapePointer(String(prop))}`,
        atKey: true,
        message: `Unknown property "${prop}".`,
      };
    }
    case 'type':
      return typeIssue(e.instancePath, new Set(String(p.type).split(',')));
    case 'const':
      return { ...base, message: `Must be ${JSON.stringify(p.allowedValue)}.` };
    case 'enum': {
      const vals = (p.allowedValues ?? []) as unknown[];
      return vals.length === 1
        ? { ...base, message: `Must be ${JSON.stringify(vals[0])}.` }
        : { ...base, message: `Must be one of ${listOf(vals)}.` };
    }
    case 'format':
      return {
        ...base,
        message:
          p.format === 'date'
            ? 'Must be a date (YYYY-MM-DD).'
            : `Must be a valid ${p.format}.`,
      };
    case 'pattern':
      return { ...base, message: `Doesn't match the pattern ${p.pattern}.` };
    case 'uniqueItems':
      return {
        ...base,
        message: `Items ${p.j} and ${p.i} are duplicates; each must be unique.`,
      };
    case 'not':
      return { ...base, message: 'This value is not allowed here.' };
    case 'false schema':
      return { ...base, message: 'This value is not allowed here.' };
    case 'minItems':
      return {
        ...base,
        message: `Needs at least ${p.limit} item${p.limit === 1 ? '' : 's'}.`,
      };
    case 'maxItems':
      return {
        ...base,
        message: `Allows at most ${p.limit} item${p.limit === 1 ? '' : 's'}.`,
      };
    case 'dependentRequired':
    case 'dependencies':
      return {
        ...base,
        message: `"${p.property}" also needs "${p.missingProperty}".`,
      };
    default: {
      const msg = e.message ?? `fails "${e.keyword}"`;
      return { ...base, message: `${msg[0].toUpperCase()}${msg.slice(1)}.` };
    }
  }
}

// --- pointers ------------------------------------------------------------------

/**
 * Split a pointer into the entity it falls in (`spell`, 3) and the path inside
 * it (`entries[2].type`). Pointers outside any entity array (`/_meta/…`, the
 * root) return null.
 */
export function issueLocation(
  pointer: string,
): { type: string; entityIdx: number; path: string } | null {
  const segs = pointer.split('/').slice(1).map(unescapePointer);
  if (segs.length < 2) return null;
  const [type, idx, ...rest] = segs;
  if (type.startsWith('_') || type === '$schema') return null;
  if (!/^\d+$/.test(idx)) return null;
  return { type, entityIdx: Number(idx), path: formatPath(rest) };
}

/** `/_meta/sources/0/json` → `_meta.sources[0].json`. */
export function pointerLabel(pointer: string): string {
  return formatPath(pointer.split('/').slice(1).map(unescapePointer));
}

/** `['entries', '2', 'type']` → `entries[2].type`. */
export function formatPath(segs: string[]): string {
  let out = '';
  for (const s of segs) {
    if (/^\d+$/.test(s)) out += `[${s}]`;
    else out += out ? `.${s}` : s;
  }
  return out;
}
