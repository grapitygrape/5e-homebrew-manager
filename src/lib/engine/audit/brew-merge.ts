/**
 * engine/audit/brew-merge.ts — merge a model's reply into a brew's JSON text.
 *
 * INTENT
 *   The convert prompt (convert-prompt.ts) asks for one JSON object keyed by
 *   homebrew array property. parseModelReply reads that reply and tolerates the
 *   usual wrapping: code fences, prose around them, or a whole file with _meta.
 *   mergeIntoBrew splices each entity into the editor text. An entity with the
 *   same identity as one already in the file replaces it; the rest are appended
 *   to their array, which is created if missing. It splices rather than
 *   reserialising, so the file keeps its indentation and the diff stays small.
 *
 * REUSE NOTES
 *   - Identity is getEntityKey (merge/copy.ts), the type-aware key `_copy`
 *     resolves by: name + source, plus class/level for features. Not
 *     collisionKey, which also counts a spell's `level`, so a revised spell at
 *     a new level wouldn't replace the old one.
 *   - Pure. The edits come back in original-text offsets as well as the merged
 *     text, so the editor can apply them as one undoable change.
 *   - _meta is never merged into an existing file. A reply that declares
 *     sources the file lacks gets a warning; adding a source is the file
 *     owner's call. An empty editor is different: the new file takes the
 *     reply's _meta, or a placeholder declaring the sources its entries use
 *     (UNKNOWN when the prompt had none to give).
 */
import { getEntityKey } from '../merge/copy.ts';
import { scanTopLevel } from './homebrew-parse.ts';
import { UNKNOWN_SOURCE } from './convert-prompt.ts';
import { isObj, nonBlank, type Obj } from '../../util.ts';

// Book-like entries are keyed by id, as on the site.
const ID_PROPS = new Set(['book', 'bookData', 'adventure', 'adventureData']);

/** Which existing entry a reply entry replaces; null when it can't say. */
function mergeKey(prop: string, e: Obj): string | null {
  if (ID_PROPS.has(prop)) return nonBlank(e.id)?.toLowerCase() ?? null;
  const source =
    nonBlank(e.source) ?? nonBlank((e.inherits as Obj | undefined)?.source);
  if (!nonBlank(e.name) || !source) return null;
  const key = getEntityKey({ ...e, source }, prop);
  // Subraces share names across races ("Arctic" under two of them).
  return prop === 'subrace'
    ? `${key}__${String(e.raceName ?? '').toLowerCase()}__${String(e.raceSource ?? '').toLowerCase()}`
    : key;
}

export interface ModelReply {
  /** Entities by array property, in reply order. */
  props: Record<string, Obj[]>;
  /** The reply's own _meta, if it sent one, and its source `json` values. */
  meta: Obj | null;
  metaSources: string[];
  /** Keys skipped because they don't hold an array of objects. */
  ignored: string[];
}

const FENCE_OPEN = /^[ \t]*(`{3,})[ \t]*([\w-]*)[ \t]*$/;

/**
 * The contents of each json (or untagged) fenced block. Line-based, so a
 * ```text block quoting the source is skipped whole rather than mistaken for
 * the start of a json one.
 */
function fencedJson(text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) continue;
    const close = new RegExp(`^[ \\t]*\`{${open[1].length},}[ \\t]*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) j++;
    if (['', 'json', 'jsonc'].includes(open[2].toLowerCase()))
      out.push(lines.slice(i + 1, j).join('\n'));
    i = j;
  }
  return out;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${what} isn't valid JSON: ${(e as Error).message}`);
  }
}

/** The JSON values in a reply: each fenced block, else the reply itself. */
function replyValues(text: string): unknown[] {
  const blocks = fencedJson(text);
  if (blocks.length > 1)
    return blocks.map((b, i) => parseJson(b, `Code block ${i + 1}`));
  if (blocks.length) return [parseJson(blocks[0], 'The code block')];
  const t = text.trim();
  if (!t) throw new Error('Paste the JSON from the model first.');
  try {
    return [JSON.parse(t)];
  } catch {
    // Prose around an unfenced object: take the outermost braces.
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    return [parseJson(a >= 0 && b > a ? t.slice(a, b + 1) : t, 'The reply')];
  }
}

const WRAP_HINT = 'Wrap entries in their property, like {"spell": [ … ]}.';

/** Read a model reply into entities by property. Throws a message to show. */
export function parseModelReply(text: string): ModelReply {
  const out: ModelReply = {
    props: {},
    meta: null,
    metaSources: [],
    ignored: [],
  };
  let count = 0;
  for (const value of replyValues(text)) {
    if (Array.isArray(value))
      throw new Error(
        `The JSON is a bare array, so there's no telling which property it belongs to. ${WRAP_HINT}`,
      );
    if (!isObj(value))
      throw new Error(`The JSON isn't an object. ${WRAP_HINT}`);
    for (const [key, v] of Object.entries(value)) {
      if (key === '_meta') {
        if (isObj(v)) out.meta = v;
        const sources = isObj(v) && Array.isArray(v.sources) ? v.sources : [];
        for (const s of sources)
          if (isObj(s) && typeof s.json === 'string')
            out.metaSources.push(s.json);
        continue;
      }
      if (key.startsWith('_') || key === '$schema') continue;
      const ents = Array.isArray(v) ? v.filter(isObj) : [];
      if (!ents.length) {
        out.ignored.push(key);
        continue;
      }
      (out.props[key] ??= []).push(...ents);
      count += ents.length;
    }
  }
  if (!count) {
    const single = out.ignored.includes('name');
    throw new Error(
      single
        ? `That looks like a single entry. ${WRAP_HINT}`
        : `No entries found. ${WRAP_HINT}`,
    );
  }
  return out;
}

export interface MergeChange {
  from: number;
  to: number;
  insert: string;
}

export interface MergedEntity {
  prop: string;
  name: string;
}

export interface MergeResult {
  text: string;
  /** Edits in original-text offsets, ascending and non-overlapping. */
  changes: MergeChange[];
  added: MergedEntity[];
  replaced: MergedEntity[];
  /** Dependencies added to _meta, as "prop: source". */
  dependencies: string[];
  warnings: string[];
}

const labelOf = (e: Obj): string => String(e.name ?? e.id ?? '(unnamed)');

/** Leading whitespace of the line holding `pos`. */
function lineIndent(raw: string, pos: number): string {
  const start = raw.lastIndexOf('\n', pos - 1) + 1;
  return /^[ \t]*/.exec(raw.slice(start, pos))![0];
}

function declaredSources(doc: Obj): Set<string> | null {
  const meta = doc._meta;
  if (!isObj(meta) || !Array.isArray(meta.sources)) return null;
  return new Set(
    meta.sources
      .map((s) => (isObj(s) && typeof s.json === 'string' ? s.json : null))
      .filter((s): s is string => !!s),
  );
}

const editionIn = (meta: Obj | null): string | null =>
  meta?.edition === 'one' || meta?.edition === 'classic' ? meta.edition : null;

/**
 * `base` (a _meta.dependencies) with the reply's dependencies added. Sources
 * compare case-insensitively, as 5etools does. `added` lists "prop: source".
 */
function withDependencies(
  base: unknown,
  reply: ModelReply,
): { deps: Obj; added: string[] } {
  const deps: Obj = isObj(base) ? { ...base } : {};
  const added: string[] = [];
  const extra = reply.meta?.dependencies;
  if (!isObj(extra)) return { deps, added };
  for (const [prop, list] of Object.entries(extra)) {
    if (!Array.isArray(list)) continue;
    const have = Array.isArray(deps[prop])
      ? [...(deps[prop] as unknown[])]
      : [];
    const lc = new Set(have.map((s) => String(s).toLowerCase()));
    for (const s of list) {
      if (!nonBlank(s) || lc.has(s.toLowerCase())) continue;
      have.push(s);
      lc.add(s.toLowerCase());
      added.push(`${prop}: ${s}`);
    }
    if (have.length) deps[prop] = have;
  }
  return { deps, added };
}

/**
 * A _meta for a new file: the reply's own if it declares sources, else a
 * placeholder declaring the sources its entries use, so the file validates
 * from the start. The placeholder keeps the reply's edition and dependencies.
 */
function newFileMeta(
  reply: ModelReply,
  now: number,
): { meta: Obj; placeholder: string[] | null; dependencies: string[] } {
  const { deps, added } = withDependencies(undefined, reply);
  if (reply.meta && Array.isArray(reply.meta.sources))
    return { meta: reply.meta, placeholder: null, dependencies: added };
  const used = new Set<string>();
  for (const ents of Object.values(reply.props))
    for (const e of ents) if (nonBlank(e.source)) used.add(e.source as string);
  if (!used.size) used.add(UNKNOWN_SOURCE);
  const sources = [...used].map((json) =>
    json === UNKNOWN_SOURCE
      ? { json, abbreviation: 'UNK', full: 'Unknown', version: '1.0.0' }
      : { json, abbreviation: json, full: json, version: '1.0.0' },
  );
  return {
    meta: {
      sources,
      dateAdded: now,
      dateLastModified: now,
      edition: editionIn(reply.meta) ?? 'classic',
      ...(added.length && { dependencies: deps }),
    },
    placeholder: [...used],
    dependencies: added,
  };
}

/**
 * Splice a parsed reply into `raw`, the brew's current text. Throws when `raw`
 * isn't a JSON object, since there'd be nothing sound to splice into.
 * `now` (epoch seconds) dates a new file's _meta.
 */
export function mergeIntoBrew(
  raw: string,
  reply: ModelReply,
  now = Math.floor(Date.now() / 1000),
): MergeResult {
  const added: MergedEntity[] = [];
  const replaced: MergedEntity[] = [];
  const warnings: string[] = [];

  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const unit = /\n([ \t]+)\S/.exec(raw)?.[1] ?? '\t';
  const ser = (e: unknown, indent: string) =>
    JSON.stringify(e, null, unit)
      .split('\n')
      .join(eol + indent);
  const arrayText = (ents: Obj[], indent: string) => {
    const inner = indent + unit;
    return `[${eol}${ents.map((e) => inner + ser(e, inner)).join(`,${eol}`)}${eol}${indent}]`;
  };

  // An empty editor becomes a new file: a _meta, then the reply's entries.
  if (!raw.trim()) {
    for (const [prop, ents] of Object.entries(reply.props))
      for (const e of ents) added.push({ prop, name: labelOf(e) });
    const { meta, placeholder, dependencies } = newFileMeta(reply, now);
    const text =
      JSON.stringify({ _meta: meta, ...reply.props }, null, unit) + eol;
    warnings.push(
      placeholder
        ? `New file: _meta is a placeholder for ${placeholder.map((s) => `"${s}"`).join(', ')}. Fill in the source details before publishing.`
        : 'New file: _meta came from the reply. Check its sources before publishing.',
    );
    return {
      text,
      changes: [{ from: 0, to: raw.length, insert: text }],
      added,
      replaced,
      dependencies,
      warnings,
    };
  }

  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Fix the editor's JSON before merging: ${(e as Error).message}`,
    );
  }
  if (!isObj(doc))
    throw new Error('The editor must hold a homebrew file object.');
  const scan = scanTopLevel(raw);
  if (scan.close === -1)
    throw new Error("Couldn't find where the editor's JSON object ends.");

  const sources = declaredSources(doc);
  const foreign = reply.metaSources.filter((s) => !sources?.has(s));
  if (foreign.length)
    warnings.push(
      `The reply's _meta declares ${foreign.map((s) => `"${s}"`).join(', ')}, which this file doesn't. _meta isn't merged; add the source yourself if it belongs here.`,
    );
  if (reply.ignored.length)
    warnings.push(
      `Skipped ${reply.ignored.map((k) => `"${k}"`).join(', ')}: not an array of entries.`,
    );

  const changes: MergeChange[] = [];
  const values = new Map(scan.values.map((v) => [v.key, v]));

  // The reply's dependencies (and an edition, if the file lacks one) go into
  // _meta. That's the one place this reserialises: _meta is small, and
  // splicing into its nested objects isn't worth the code.
  const fileMeta = isObj(doc._meta) ? doc._meta : null;
  const fileEdition = editionIn(fileMeta);
  const replyEdition = editionIn(reply.meta);
  const { deps, added: dependencies } = withDependencies(
    fileMeta?.dependencies,
    reply,
  );
  const setEdition = !!fileMeta && !fileEdition && !!replyEdition;
  if (fileEdition && replyEdition && fileEdition !== replyEdition)
    warnings.push(
      `The reply was converted for edition "${replyEdition}", but this file is "${fileEdition}". Check its tags and casing.`,
    );
  const metaSpan = values.get('_meta');
  if (dependencies.length || setEdition) {
    if (!fileMeta || !metaSpan) {
      warnings.push(
        `This file has no _meta, so the reply's dependencies (${dependencies.join(', ')}) weren't added.`,
      );
      dependencies.length = 0;
    } else {
      const next: Obj = { ...fileMeta };
      if (dependencies.length) next.dependencies = deps;
      if (setEdition) next.edition = replyEdition;
      changes.push({
        from: metaSpan.start,
        to: metaSpan.end + 1,
        insert: ser(next, lineIndent(raw, metaSpan.start)),
      });
    }
  }
  const topIndent = scan.values.length
    ? lineIndent(raw, scan.values[0].start)
    : unit;
  const newProps: string[] = [];
  const seen = new Set<string>();

  for (const [prop, ents] of Object.entries(reply.props)) {
    const v = values.get(prop);
    const existing = doc[prop];
    if (v && !Array.isArray(existing)) {
      warnings.push(
        `"${prop}" in this file isn't an array, so its ${ents.length} entries were skipped.`,
      );
      continue;
    }
    const current = (existing as unknown[] | undefined) ?? [];
    const used = new Set<number>();
    const appends: Obj[] = [];

    for (const e of ents) {
      const name = labelOf(e);
      const src = typeof e.source === 'string' ? e.source : null;
      if (sources && src && !sources.has(src))
        warnings.push(
          `${prop} "${name}" uses source "${src}", which this file's _meta doesn't declare.`,
        );
      const key = mergeKey(prop, e);
      if (key) {
        if (seen.has(`${prop}\0${key}`))
          warnings.push(
            `${prop} "${name}" is in the reply twice; both were added.`,
          );
        seen.add(`${prop}\0${key}`);
      }
      const idx = key
        ? current.findIndex(
            (x, i) => !used.has(i) && isObj(x) && mergeKey(prop, x) === key,
          )
        : -1;
      const span = idx >= 0 ? v?.items?.[idx] : undefined;
      if (span) {
        used.add(idx);
        changes.push({
          from: span.start,
          to: span.end + 1,
          insert: ser(e, lineIndent(raw, span.start)),
        });
        replaced.push({ prop, name });
      } else {
        appends.push(e);
        added.push({ prop, name });
      }
    }
    if (!appends.length) continue;

    const last = v?.items?.at(-1);
    if (last) {
      const indent = lineIndent(raw, last.start);
      changes.push({
        from: last.end + 1,
        to: last.end + 1,
        insert: appends
          .map((e) => `,${eol}${indent}${ser(e, indent)}`)
          .join(''),
      });
    } else if (v) {
      // An empty array: rewrite it in place.
      changes.push({
        from: v.start,
        to: v.end + 1,
        insert: arrayText(appends, lineIndent(raw, v.start)),
      });
    } else {
      newProps.push(
        `${JSON.stringify(prop)}: ${arrayText(appends, topIndent)}`,
      );
    }
  }

  // New properties go after the last top-level value, together in one edit.
  if (newProps.length) {
    const body = newProps.join(`,${eol}${topIndent}`);
    const lastValue = scan.values.at(-1);
    changes.push(
      lastValue
        ? {
            from: lastValue.end + 1,
            to: lastValue.end + 1,
            insert: `,${eol}${topIndent}${body}`,
          }
        : {
            from: scan.open + 1,
            to: scan.open + 1,
            insert: `${eol}${topIndent}${body}${eol}`,
          },
    );
  }

  changes.sort((a, b) => a.from - b.from);
  // An insertion where another edit ends (new properties right after a
  // rewritten _meta) joins that edit, so no two edits touch.
  for (let i = changes.length - 1; i > 0; i--) {
    const [prev, c] = [changes[i - 1], changes[i]];
    if (c.from === c.to && c.from === prev.to) {
      prev.insert += c.insert;
      changes.splice(i, 1);
    }
  }
  let text = raw;
  for (const c of [...changes].reverse())
    text = text.slice(0, c.from) + c.insert + text.slice(c.to);
  // A guard on the splicing itself: never hand back text that won't parse.
  try {
    JSON.parse(text);
  } catch (e) {
    throw new Error(
      `The merge produced invalid JSON, so nothing changed: ${(e as Error).message}`,
    );
  }
  return { text, changes, added, replaced, dependencies, warnings };
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Status line after a merge. */
export function describeMerge(r: MergeResult): string {
  const parts: string[] = [];
  if (r.added.length)
    parts.push(`added ${count(r.added.length, 'entry', 'entries')}`);
  if (r.replaced.length)
    parts.push(`replaced ${count(r.replaced.length, 'entry', 'entries')}`);
  if (r.dependencies.length)
    parts.push(
      `added ${count(r.dependencies.length, 'dependency', 'dependencies')} (${r.dependencies.join(', ')})`,
    );
  if (!parts.length) return 'Nothing merged.';
  const head = parts.join(', ');
  return `${head.charAt(0).toUpperCase()}${head.slice(1)}.`;
}
