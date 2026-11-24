/**
 * scripts/lib/upstream.ts — the parts of `upstream:check` and `upstream:update`
 * that don't need the checkouts: reading patches, comparing schema enums with
 * the guides, parsing `git cat-file --batch` output, and the temp-folder git
 * checks (`git apply --check`, `git merge-file`) that never touch a repo.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export {
  resolveModuleSource,
  type ModuleSourceContext,
} from '../../src/lib/engine/deploy-modules/apply.ts';

// --- patches ------------------------------------------------------------------

/** The files a git patch changes, from its `diff --git a/X b/X` lines (as diff_files in modules.rs). */
export function diffFiles(patch: string): string[] {
  const out: string[] = [];
  for (const line of patch.split('\n')) {
    if (!line.startsWith('diff --git a/')) continue;
    const rest = line.slice('diff --git a/'.length).replace(/\r$/, '');
    // "X b/X": when both halves match, a space in the path can't mislead the split.
    const half = Math.floor((rest.length - 3) / 2);
    if (
      rest.slice(half, half + 3) === ' b/' &&
      rest.slice(0, half) === rest.slice(half + 3)
    )
      out.push(rest.slice(0, half));
    else out.push(rest.split(' b/')[0]);
  }
  return out;
}

/** The upstream version a customizer export names on its first line, e.g. "built on upstream v2.41.0 (32ef600)". */
export function patchBase(
  patch: string,
): { describe: string; commit: string } | null {
  const m = /built on upstream (\S+) \(([0-9a-f]{7,40})\)/.exec(
    patch.split('\n', 1)[0],
  );
  return m ? { describe: m[1], commit: m[2] } : null;
}

/** Pages, compiled CSS and the search index: a build regenerates these, so a conflict in one never needs a person. */
export function isGenerated(file: string): boolean {
  return (
    /^[^/]+\.html$/.test(file) ||
    /^css\/[^/]+\.css$/.test(file) ||
    /^search\/[^/]+\.json$/.test(file)
  );
}

/**
 * Parse the binary stdout of `git cat-file --batch` into a map of path -> UTF-8
 * blob content, matching the order of `paths` fed on stdin.
 */
export function parseCatFileBatch(
  buf: Buffer,
  paths: string[],
): Map<string, string> {
  const out = new Map<string, string>();
  let offset = 0;
  for (const filePath of paths) {
    if (offset >= buf.length) break;
    const nl = buf.indexOf(0x0a, offset);
    if (nl === -1) break;
    const header = buf.subarray(offset, nl).toString('utf8').replace(/\r$/, '');
    offset = nl + 1;
    if (header.endsWith(' missing')) continue;
    const parts = header.split(' ');
    const size = Number(parts[2]);
    if (!Number.isFinite(size) || size < 0)
      throw new Error(`Unexpected git cat-file header: ${header}`);
    const bodyEnd = offset + size;
    out.set(filePath, buf.subarray(offset, bodyEnd).toString('utf8'));
    // git writes a trailing LF after each object's content.
    offset = bodyEnd + 1;
  }
  return out;
}

const CORE_SMOKE_PAGES = ['index', 'spells', 'items', 'bestiary', 'classes'];
const SHARED_CHANGE_RE =
  /^(?:scss\/|css\/|js\/(?:render|utils|navigation|filter|list|omni|styleswitch|hist|parser|scalecreature)|node\/generate-pages\/template\/(?:_partial|page\/_))/;

/**
 * Map a list of upstream-changed file paths to the `.html` page basenames
 * worth checking with `customizer/shell/check.mjs`. Shared code/style changes
 * pull in the core smoke set so layout regressions don't slip past.
 */
export function touchedPages(
  changedFiles: string[],
  existingPages: string[],
): string[] {
  const known = new Set(existingPages);
  const picked = new Set<string>();
  let shared = false;

  for (const raw of changedFiles) {
    const file = raw.replace(/\\/g, '/');
    if (SHARED_CHANGE_RE.test(file)) shared = true;

    const html = /^([^/]+)\.html$/.exec(file);
    if (html && known.has(html[1])) {
      picked.add(html[1]);
      continue;
    }

    const js = /^js\/([^/]+?)(?:\.js|\/)/.exec(file);
    if (js && known.has(js[1])) {
      picked.add(js[1]);
      continue;
    }

    const hbs = /^node\/generate-pages\/template\/page\/page-([^/.]+)\.hbs$/.exec(
      file,
    );
    if (hbs && known.has(hbs[1])) {
      picked.add(hbs[1]);
      continue;
    }
  }

  if (shared || picked.size === 0) {
    for (const p of CORE_SMOKE_PAGES) {
      if (known.has(p)) picked.add(p);
    }
  }

  return [...picked].sort();
}

// --- temp-folder git checks ------------------------------------------------------

function inTemp<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbm-upstream-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Whether `patch` applies with a plain `git apply`, as Prepare runs it, to the
 * files `read` returns (null for a file that doesn't exist at that version).
 * Runs in a temp folder outside any repo, so no checkout is touched.
 */
export function patchApplies(
  patch: string,
  read: (file: string) => string | null,
): { ok: boolean; errors: string[] } {
  return inTemp((dir) => {
    for (const file of new Set(diffFiles(patch))) {
      const text = read(file);
      if (text === null) continue;
      const out = path.join(dir, file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, text);
    }
    const patchFile = path.join(dir, '.reskin.patch');
    fs.writeFileSync(patchFile, patch);
    const res = spawnSync(
      'git',
      ['apply', '--check', '--whitespace=nowarn', patchFile],
      { cwd: dir, encoding: 'utf8' },
    );
    return {
      ok: res.status === 0,
      errors: lines(res.stderr ?? '').filter((l) => l.startsWith('error:')),
    };
  });
}

/** How many conflicts a three-way merge of one file leaves, as a rebase would hit them. */
export function mergeConflicts(
  ours: string,
  base: string,
  theirs: string,
): number {
  return inTemp((dir) => {
    const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => path.join(dir, n));
    fs.writeFileSync(o, ours);
    fs.writeFileSync(b, base);
    fs.writeFileSync(t, theirs);
    const res = spawnSync('git', ['merge-file', '-p', '--quiet', o, b, t], {
      encoding: 'utf8',
      maxBuffer: 2e9,
    });
    // merge-file exits with the conflict count, or a negative number (255) on error.
    if (res.status === null || res.status > 127)
      throw new Error(`git merge-file failed: ${res.stderr}`);
    return res.status;
  });
}

// --- schema enums against the guides ----------------------------------------------

type Json = unknown;

/** Every string `enum` in a schema, by its JSON pointer. */
export function schemaEnums(schema: Json, at = ''): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (node: Json, ptr: string) => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${ptr}/${i}`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'enum' && Array.isArray(v)) {
        const strings = v.filter((x): x is string => typeof x === 'string');
        if (strings.length) out.set(ptr, strings);
      } else walk(v, `${ptr}/${k}`);
    }
  };
  walk(schema, at);
  return out;
}

export interface EnumChange {
  file: string;
  pointer: string;
  added: string[];
  removed: string[];
  kept: string[];
}

/** Enums that gained or lost values between two versions of the same schema files. */
export function enumChanges(
  before: Record<string, Json>,
  after: Record<string, Json>,
): EnumChange[] {
  const out: EnumChange[] = [];
  for (const [file, schema] of Object.entries(after)) {
    const old = schemaEnums(before[file] ?? {});
    for (const [pointer, values] of schemaEnums(schema)) {
      const was = old.get(pointer);
      if (!was) continue; // a new enum is a new property, which `npm run audit` reports
      const added = values.filter((v) => !was.includes(v));
      const removed = was.filter((v) => !values.includes(v));
      if (added.length || removed.length)
        out.push({
          file,
          pointer,
          added,
          removed,
          kept: was.filter((v) => values.includes(v)),
        });
    }
  }
  return out;
}

export interface StaleList {
  guide: string;
  line: number;
  change: EnumChange;
  missing: string[];
  stillListed: string[];
}

// Generated lists are `guides:enums`'s job, so their text is left out here.
const GENERATED_LIST =
  /<span class="schema-enum" data-enum="[A-Za-z]+">[\s\S]*?<\/span>/g;

/**
 * Guide lines that list an enum by hand: they quote two or more of its values
 * that didn't change, but not the values it gained, or still quote ones it lost.
 */
export function staleLists(
  changes: EnumChange[],
  guides: Record<string, string>,
): StaleList[] {
  const out: StaleList[] = [];
  const quoted = (line: string, v: string) => line.includes(`"${v}"`);
  for (const [guide, text] of Object.entries(guides)) {
    const guideLines = text
      .replace(GENERATED_LIST, (m) => m.replace(/[^\n]/g, ''))
      .split('\n');
    guideLines.forEach((line, i) => {
      for (const change of changes) {
        if (change.kept.filter((v) => quoted(line, v)).length < 2) continue;
        const missing = change.added.filter((v) => !quoted(line, v));
        const stillListed = change.removed.filter((v) => quoted(line, v));
        if (missing.length || stillListed.length)
          out.push({ guide, line: i + 1, change, missing, stillListed });
      }
    });
  }
  return out;
}

// --- styling ---------------------------------------------------------------------

/**
 * Component classes (`block__part`) that a diff adds and doesn't also remove.
 * Upstream's `ve-*` utilities are styled already, so only these can need a shell rule.
 */
export function newComponentClasses(diff: string): string[] {
  const CLASS = /[a-z][a-z0-9-]*__[a-z0-9_-]*[a-z0-9]/g;
  const added = new Set<string>();
  const removed = new Set<string>();
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    const into = line.startsWith('+')
      ? added
      : line.startsWith('-')
        ? removed
        : null;
    if (into) for (const m of line.matchAll(CLASS)) into.add(m[0]);
  }
  return [...added].filter((c) => !removed.has(c)).sort();
}
