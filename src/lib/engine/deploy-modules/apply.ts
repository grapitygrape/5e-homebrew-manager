/**
 * engine/deploy-modules/apply.ts — a deploy module's text patches, as pipeline.rs applies them.
 *
 * INTENT
 *   Prepare patches the site in Rust. The 5e-testing dev server and the CLI
 *   checks need the same result without the app, so this is a port of
 *   `apply_entries`' patch handling. Pure: callers read and write the files.
 *   The fixtures beside this file are checked by both this port and the Rust
 *   tests, so a change on one side that the other doesn't make fails a test.
 */
import path from 'node:path';

export type Values = Record<string, unknown>;

export interface ModuleSourceContext {
  moduleDir: string;
  dataDir: string;
  managerDir: string;
  values: Values;
}

export interface Patch {
  note?: string;
  find?: string;
  replace?: string;
  isRegex?: boolean;
  flags?: string;
  contains?: string;
  alsoCommentNextDivider?: boolean;
  alsoCommentNextRegex?: string;
  insertFile?: string;
  marker?: string;
  position?: string;
  ensureArrayItems?: { arrayKey?: string; items?: string[] };
  itemsOption?: string;
  unlessContains?: string;
  allowMissing?: boolean;
  option?: string;
}

export interface PatchOutcome {
  text: string;
  status: 'applied' | 'skipped' | 'error';
  details: string[];
}

interface StepResult {
  text: string;
  count: number;
  alreadySatisfied: boolean;
  notFound: boolean;
}

export interface ModuleOptionDef {
  id: string;
  kind: string;
  default?: unknown;
}

const BACKREF = /\$(?:\d+|&|<[^>]+>)/;
const bytes = (s: string) => new TextEncoder().encode(s).length;

// Rust's regex crate spells named groups (?P<name>…) and refers to them as
// ${name} or $name in a replacement; JS wants (?<name>…) and $<name>.
const jsPattern = (src: string) => src.replace(/\(\?P</g, '(?<');
const jsReplacement = (src: string) =>
  src
    .replace(/\$\{(\d+)\}/g, '$$$1')
    .replace(/\$\{(\w+)\}/g, '$$<$1>')
    .replace(/\$([A-Za-z_]\w*)/g, '$$<$1>');

/** An entry or patch with `option` runs only while that toggle is on. */
export function optionAllows(item: { option?: string }, values: Values): boolean {
  return item.option === undefined || values[item.option] === true;
}

/** Fills `{option:<id>}` and `{option:<id>:lower}` in a patch's replacement text. */
export function fillOptions(text: string, values: Values): string {
  return text.replace(/\{option:([\w-]+)(:lower)?\}/g, (whole, id, lower) => {
    const value = values[id];
    if (typeof value !== 'string') return whole;
    return lower ? value.trim().toLowerCase() : value.trim();
  });
}

// Matches text_fits in modules.rs.
const textFits = (v: unknown) =>
  typeof v === 'string' && v.trim() !== '' && !/["`\\$<>\n\r]/.test(v);

function optionFits(kind: string, v: unknown): boolean {
  if (kind === 'toggle') return typeof v === 'boolean';
  if (kind === 'list')
    return Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (kind === 'text') return textFits(v);
  return typeof v === 'string';
}

/** A module's switch and option values: the saved ones that fit, else the defaults. */
export function moduleValues(
  def: { defaultEnabled?: boolean; options?: ModuleOptionDef[] },
  saved: { enabled?: unknown; options?: Record<string, unknown> } | undefined,
): { enabled: boolean; values: Values } {
  const enabled =
    typeof saved?.enabled === 'boolean'
      ? saved.enabled
      : (def.defaultEnabled ?? false);
  const values: Values = {};
  for (const opt of def.options ?? []) {
    const v = saved?.options?.[opt.id];
    values[opt.id] = v !== undefined && optionFits(opt.kind, v) ? v : opt.default;
  }
  return { enabled, values };
}

/**
 * A module entry's `source`, as resolve_source in modules.rs reads it:
 * `{option:<id>}`, `{data}`, `{manager}`, an absolute path, or a path in the module folder.
 */
export function resolveModuleSource(
  raw: string,
  ctx: ModuleSourceContext,
): string | null {
  const opt = /^\{option:([^}]+)\}(.*)$/.exec(raw);
  if (opt) {
    const value = ctx.values[opt[1]];
    if (typeof value !== 'string' || !value.trim()) return null;
    const v = value.trim();
    if (
      !v.startsWith('{data}') &&
      !v.startsWith('{manager}') &&
      !path.isAbsolute(v)
    )
      return null;
    const base = resolveModuleSource(v, ctx);
    if (!base) return null;
    const rest = opt[2].replace(/^[/\\]+/, '');
    return rest ? path.join(base, rest) : base;
  }
  const strip = (s: string) => s.replace(/^[/\\]+/, '');
  if (raw.startsWith('{data}'))
    return ctx.dataDir ? path.join(ctx.dataDir, strip(raw.slice(6))) : null;
  if (raw.startsWith('{manager}'))
    return ctx.managerDir
      ? path.join(ctx.managerDir, strip(raw.slice(9)))
      : null;
  return path.isAbsolute(raw) ? raw : path.join(ctx.moduleDir, raw);
}

function commentLine(line: string): [string, boolean] {
  const body = line.trimStart();
  if (body.startsWith('//')) return [line, false];
  return [`${line.slice(0, line.length - body.length)}// ${body}`, true];
}

function applyContains(text: string, p: Patch): StepResult {
  const lines = text.split('\n');
  const re = p.isRegex ? new RegExp(jsPattern(p.contains!)) : null;
  const nextRe = p.alsoCommentNextRegex
    ? new RegExp(jsPattern(p.alsoCommentNextRegex))
    : null;
  let count = 0;
  let matched = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!(re ? re.test(lines[i]) : lines[i].includes(p.contains!))) continue;
    matched++;
    const [line, changed] = commentLine(lines[i]);
    if (changed) {
      lines[i] = line;
      count++;
    }
    const next = lines[i + 1];
    if (next === undefined) continue;
    const div = p.alsoCommentNextDivider && next.includes('_addElement_divider');
    if (div || nextRe?.test(next)) {
      const [nextLine, nextChanged] = commentLine(next);
      if (nextChanged) {
        lines[i + 1] = nextLine;
        count++;
      }
    }
  }
  return {
    text: lines.join('\n'),
    count,
    alreadySatisfied: count === 0 && matched > 0,
    notFound: false,
  };
}

function isAlreadyReplaced(text: string, replace: string): boolean {
  if (!replace) return false;
  const segments = replace
    .split(new RegExp(BACKREF.source, 'g'))
    .map((s) => s.trim())
    .filter((s) => bytes(s) >= 8);
  return segments.length > 0 && segments.every((s) => text.includes(s));
}

function isInsertion(find: string, replace: string, isRegex: boolean): boolean {
  if (isRegex) return BACKREF.test(replace);
  return replace !== '' && find !== '' && replace.includes(find);
}

function applyText(text: string, find: string, replace: string, p: Patch): StepResult {
  const isRegex = p.isRegex ?? false;
  const unchanged = (alreadySatisfied: boolean): StepResult => ({
    text,
    count: 0,
    alreadySatisfied,
    notFound: false,
  });
  if (isInsertion(find, replace, isRegex) && isAlreadyReplaced(text, replace))
    return unchanged(true);

  if (isRegex) {
    const flags = p.flags;
    const reFlags = [...'ims'].filter((c) => flags?.includes(c)).join('');
    const all = new RegExp(jsPattern(find), `g${reFlags}`);
    const count = [...text.matchAll(all)].length;
    if (count === 0) return unchanged(isAlreadyReplaced(text, replace));
    const global = flags === undefined || flags.includes('g');
    const re = global ? all : new RegExp(jsPattern(find), reFlags);
    return {
      text: text.replace(re, jsReplacement(replace)),
      count,
      alreadySatisfied: false,
      notFound: false,
    };
  }

  const count = find ? text.split(find).length - 1 : 0;
  if (count === 0) return unchanged(isAlreadyReplaced(text, replace));
  return {
    text: text.split(find).join(replace),
    count,
    alreadySatisfied: false,
    notFound: false,
  };
}

function applyInsertFile(text: string, block: string, p: Patch): StepResult {
  const begin = `/* === BEGIN ${p.marker} === */`;
  const end = `/* === END ${p.marker} === */`;
  const fenced = `${begin}\n${block.trimEnd()}\n${end}`;
  const position = p.position ?? 'end';
  const ok = (next: string): StepResult => ({
    text: next,
    count: 1,
    alreadySatisfied: false,
    notFound: false,
  });

  const b = text.indexOf(begin);
  const e = text.indexOf(end);
  if (b !== -1 && e !== -1 && e > b) {
    if (text.slice(b, e + end.length) === fenced)
      return { text, count: 0, alreadySatisfied: true, notFound: false };
    return ok(text.slice(0, b) + fenced + text.slice(e + end.length));
  }
  if (position === 'end') return ok(`${text.trimEnd()}\n\n${fenced}`);

  if (p.find === undefined)
    throw new Error(`insertFile position "${position}" requires a "find" anchor`);
  const at = text.indexOf(p.find);
  if (at === -1) return { text, count: 0, alreadySatisfied: false, notFound: false };
  const splice = position === 'after' ? at + p.find.length : at;
  return ok(`${text.slice(0, splice)}\n${fenced}\n${text.slice(splice)}`);
}

function ensureArrayItems(text: string, arrayKey: string, items: string[]): StepResult {
  const lines = text.split('\n');
  const missingArray = { text, count: 0, alreadySatisfied: false, notFound: true };
  const start = lines.findIndex((l) => l.includes(`${arrayKey}:`));
  if (start === -1) return missingArray;
  const rel = lines.slice(start + 1).findIndex((l) => l.includes(']'));
  if (rel === -1) return missingArray;
  const endIdx = start + 1 + rel;

  const startLine = lines[start];
  const indent = `${startLine.slice(0, startLine.length - startLine.trimStart().length)}  `;
  const existing = new Set(
    lines
      .slice(start + 1, endIdx)
      .map((l) => l.match(/"([^"]+)"/)?.[1])
      .filter((x): x is string => x !== undefined),
  );
  const missing = items.filter((it) => !existing.has(it));
  if (missing.length === 0)
    return { text, count: 0, alreadySatisfied: true, notFound: false };
  return {
    text: [
      ...lines.slice(0, endIdx),
      ...missing.map((it) => `${indent}"${it}",`),
      ...lines.slice(endIdx),
    ].join('\n'),
    count: missing.length,
    alreadySatisfied: false,
    notFound: false,
  };
}

/**
 * One patch against `text`. Null when it has nothing to do (an
 * ensureArrayItems with no items), which isn't a miss.
 */
export function applyPatch(
  text: string,
  p: Patch,
  values: Values,
  readInsert: (name: string) => string,
): StepResult | null {
  if (p.insertFile !== undefined) {
    if (p.marker === undefined) throw new Error(`Patch for ${p.insertFile} is missing its marker`);
    return applyInsertFile(text, readInsert(p.insertFile), p);
  }
  if (p.ensureArrayItems) {
    const fromOption = p.itemsOption ? values[p.itemsOption] : undefined;
    const items = [
      ...(p.ensureArrayItems.items ?? []),
      ...(Array.isArray(fromOption) ? fromOption : []),
    ]
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return null;
    return ensureArrayItems(text, p.ensureArrayItems.arrayKey ?? '', items);
  }
  if (p.contains !== undefined) return applyContains(text, p);
  return applyText(text, p.find ?? '', fillOptions(p.replace ?? '', values), p);
}

/** Every patch of one `patch` entry, in order, with Rust's status and wording. */
export function applyPatches(
  text: string,
  target: string,
  patches: Patch[],
  values: Values,
  readInsert: (name: string) => string,
): PatchOutcome {
  let status: PatchOutcome['status'] = 'applied';
  const details: string[] = [];
  patches.forEach((p, i) => {
    if (!optionAllows(p, values)) return;
    const labelOrIndex = p.note || `patch #${i + 1}`;
    if (p.unlessContains !== undefined && text.includes(p.unlessContains)) {
      details.push(`Already applied: ${labelOrIndex}`);
      return;
    }
    const res = applyPatch(text, p, values, readInsert);
    if (!res) return;
    if (res.count === 0 && res.alreadySatisfied) {
      details.push(`Already applied: ${labelOrIndex}`);
      return;
    }
    if (res.count === 0 || res.notFound) {
      const label = p.note ? `${target} — ${p.note}` : `${target} (patch #${i + 1})`;
      if (p.allowMissing) {
        details.push(`Skipped (no match): ${label}`);
        if (status !== 'error') status = 'skipped';
      } else {
        details.push(`Required patch failed to match: ${label}`);
        status = 'error';
      }
      return;
    }
    text = res.text;
    details.push(`${labelOrIndex}: ${res.count} match(es)`);
  });
  return { text, status, details };
}
