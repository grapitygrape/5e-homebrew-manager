/**
 * engine/audit/submission-lint.ts — the homebrew repo's CI, run locally.
 *
 * INTENT
 *   TheGiddyLimit/homebrew rejects a PR on rules that live in 5etools-utils
 *   (BrewCleaner, BrewTester*, TestData) and the brew schema. Each rule here
 *   cites the check it mirrors, so a CI failure becomes a local warning with
 *   a fix — before the PR. Pure: file name + parsed JSON (+ raw text for the
 *   formatting check) in, issues out. Schema validation of entities is NOT
 *   repeated here; the validator already does that.
 *
 * SEVERITY
 *   error    CI fails on it.
 *   warning  CI auto-fixes it, or it's allowed but almost certainly wrong.
 *   info     advice (target folder, formatting the cleaner will rewrite).
 */
import type { SiteSources } from './site-sources.ts';
import { isObj, nonBlank, type Obj } from '../../util.ts';
import { eachString, lintMeta } from './lint-meta.ts';

export interface LintIssue {
  severity: 'error' | 'warning' | 'info';
  /** Stable rule id, e.g. "meta.dateAdded". */
  rule: string;
  message: string;
  /** Where CI enforces it. */
  ci?: string;
}

export interface LintInput {
  file: string;
  doc: Record<string, unknown>;
  /** Raw file text, for the cleaner's reformat check (optional). */
  raw?: string;
  site: SiteSources;
  /** "Now", in unix seconds (injectable for tests). */
  now?: number;
}

export interface LintReport {
  file: string;
  issues: LintIssue[];
  /** Repo folder this file belongs in (collection when mixed). */
  folder: string | null;
  totals: { errors: number; warnings: number; infos: number };
}

const CONTENT_KEY_BLOCKLIST = new Set([
  '$schema',
  '_meta',
  '_test',
  'siteVersion',
]);
const RE_NAME_FORMAT = /^[^;]+; .+\.json$/;
const RE_INVALID_FILE_CHARS = /[<>:"/\\|?*#%@]/;

/** Filename characters the repo's cleaner rewrites (UtilClean). */
const FILENAME_REPLACEMENTS: Record<string, string> = {
  '—': '-',
  '–': '-',
  '‑': '-',
  '−': '-',
  ' ': ' ',
  ' ': ' ',
  '“': '',
  '”': '',
  '’': "'",
  '‘': "'",
  '…': '...',
  '​': '',
  ' ': ' ',
  '‚': ',',
};
const cleanFilename = (s: string): string =>
  s.replace(/[—–‑−  “”’‘…​ ‚]/g, (c) => FILENAME_REPLACEMENTS[c] ?? c);

/** Repo folder → primary prop(s) a file there must contain (BrewTesterFileProps). */
const DIR_TO_PRIMARY_PROP: Record<string, string[]> = {
  creature: ['monster'],
  book: ['book', 'bookData'],
  adventure: ['adventure', 'adventureData'],
  makebrew: ['makebrewCreatureTrait'],
  encounterbuilder: ['encounterShape'],
  crochetpattern: ['crochetPattern'],
};
const PROP_TO_DIR: Record<string, string> = {
  monster: 'creature',
  book: 'book',
  bookData: 'book',
  adventure: 'adventure',
  adventureData: 'adventure',
  makebrewCreatureTrait: 'makebrew',
  encounterShape: 'encounterbuilder',
  crochetPattern: 'crochetpattern',
};
/** Supporting props that don't decide the folder on their own. */
const SUPPORT_PROPS =
  /Fluff$|^legendaryGroup$|^monsterTemplate$|^legendaryGroupTemplate$|^subclassFeature$|^classFeature$|^itemProperty$|^itemType$|^itemEntry$|^table$/;

/** Official class ids (BrewTesterDependencies._CLASS_IDS_OFFICIAL). */
const CLASS_IDS_OFFICIAL = new Set([
  'artificer',
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'mystic',
  'paladin',
  'ranger',
  'rogue',
  'sidekick',
  'sorcerer',
  'warlock',
  'wizard',
]);
const PROPS_CLASS = new Set([
  'class',
  'classFeature',
  'classFluff',
  'subclass',
  'subclassFeature',
  'subclassFluff',
]);
const PROPS_CLASS_NAME = new Set(['class', 'classFluff']);

export function lintSubmission(input: LintInput): LintReport {
  const { file, doc, site } = input;
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const issues: LintIssue[] = [];
  const add = (
    severity: LintIssue['severity'],
    rule: string,
    message: string,
    ci?: string,
  ): void => {
    issues.push({ severity, rule, message, ci });
  };
  const name = file.replace(/\\/g, '/').split('/').at(-1) ?? file;

  // --- file name (BrewTesterFileNames, BrewCleaner) -----------------------------------
  if (!name.endsWith('.json'))
    add(
      'error',
      'file.extension',
      `file must end in ".json" (case-sensitive)`,
      'test:file-names',
    );
  if (!RE_NAME_FORMAT.test(name))
    add(
      'error',
      'file.name',
      `file name must be "Author; Title.json" — got "${name}"`,
      'test:file-names',
    );
  if (RE_INVALID_FILE_CHARS.test(name))
    add(
      'error',
      'file.chars',
      `file name contains a character that's invalid on Windows or in a URL (< > : " / \\ | ? * # % @)`,
      'test:clean',
    );
  const cleaned = cleanFilename(name);
  if (cleaned !== name)
    add(
      'error',
      'file.nonAscii',
      `file name has typographic characters the cleaner rejects — rename to "${cleaned}"`,
      'test:clean',
    );

  // --- _meta (lint-meta.ts) -------------------------------------------------------------
  const declared = lintMeta(doc, site, now, add);
  if (!declared) return finish(file, issues, null);
  const meta = doc._meta as Obj;
  const keys = Object.keys(doc);

  // --- content arrays + sources (BrewCleaner._testFile_sources) ---------------------------------
  const used = new Set<string>();
  const contentProps: string[] = [];
  for (const k of keys) {
    if (CONTENT_KEY_BLOCKLIST.has(k)) continue;
    const data = doc[k];
    if (!Array.isArray(data)) {
      add('error', 'content.notArray', `"${k}" must be an array`, 'test:clean');
      continue;
    }
    if (!data.length) {
      add(
        'error',
        'content.empty',
        `"${k}" is an empty array — remove it`,
        'test:clean',
      );
      continue;
    }
    contentProps.push(k);
    const missing = new Map<string, string[]>();
    let noSource = 0;
    for (const it of data as Obj[]) {
      if (!isObj(it)) continue;
      const src =
        nonBlank(it.source) ??
        nonBlank((it.inherits as Obj | undefined)?.source);
      if (!src) {
        noSource++;
        continue;
      }
      used.add(src);
      if (!declared.has(src)) {
        const l = missing.get(src) ?? [];
        l.push(String(it.name ?? it.id ?? '?'));
        missing.set(src, l);
      }
    }
    if (noSource)
      add(
        'error',
        'content.noSource',
        `${noSource} "${k}" entr${noSource === 1 ? 'y has' : 'ies have'} no source`,
        'test:clean',
      );
    for (const [src, names] of missing) {
      const ci = [...declared].find(
        (d) => d.toLowerCase() === src.toLowerCase(),
      );
      add(
        'error',
        'content.undeclaredSource',
        `${names.length} "${k}" entr${names.length === 1 ? 'y uses' : 'ies use'} source "${src}", which isn't in _meta.sources${ci ? ` (declared as "${ci}" — source matching here is case-sensitive)` : ''}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? '…' : ''}`,
        'test:clean',
      );
    }
  }
  for (const d of declared)
    if (!used.has(d))
      add(
        'warning',
        'meta.unusedSource',
        `source "${d}" is declared but no entity uses it`,
      );

  // --- book/adventure id tuples (BrewCleaner._testFile_publicationTuples) -----------------------
  for (const [c, d] of [
    ['book', 'bookData'],
    ['adventure', 'adventureData'],
  ]) {
    const ids = (p: string): Set<string> =>
      new Set(
        ((Array.isArray(doc[p]) ? doc[p] : []) as Obj[]).map((x) =>
          String(x?.id),
        ),
      );
    const a = ids(c);
    const b = ids(d);
    if (!a.size && !b.size) continue;
    if (a.size !== b.size || [...a].some((x) => !b.has(x)))
      add(
        'error',
        'publication.ids',
        `"${c}" ids (${[...a].join(', ') || 'none'}) must match "${d}" ids (${[...b].join(', ') || 'none'})`,
        'test:clean',
      );
  }

  // --- _copy dependencies (BrewTesterDependencies) ---------------------------------------------------
  const deps = (isObj(meta.dependencies) ? meta.dependencies : {}) as Record<
    string,
    unknown
  >;
  const missingDeps = new Map<string, Set<string>>();
  for (const [prop, arr] of Object.entries(doc)) {
    if (!Array.isArray(arr)) continue;
    for (const ent of arr as Obj[]) {
      const copy = ent?._copy as Obj | undefined;
      if (!isObj(copy)) continue;
      const src = nonBlank(copy.source);
      if (!src || declared.has(src)) continue;
      let dep = src;
      if (PROPS_CLASS.has(prop) && site.official.has(src.toLowerCase())) {
        const classId = String(
          (PROPS_CLASS_NAME.has(prop) ? copy.name : copy.className) ?? '',
        )
          .toLowerCase()
          .trim();
        if (CLASS_IDS_OFFICIAL.has(classId)) dep = classId;
      }
      const have = Array.isArray(deps[prop]) ? (deps[prop] as unknown[]) : [];
      if (have.includes(dep)) continue;
      const set = missingDeps.get(prop) ?? new Set();
      set.add(dep);
      missingDeps.set(prop, set);
    }
  }
  for (const [prop, set] of missingDeps)
    add(
      'error',
      'meta.dependencies',
      `"${prop}" entries _copy from outside this file — add "_meta.dependencies": {"${prop}": [${[...set].map((s) => `"${s}"`).join(', ')}]}`,
      'test:dependencies',
    );

  // --- string contents (TestData BraceCheck / EscapeCharacterCheck) ---------------------------------
  let braces = 0;
  let escapes = 0;
  const braceSamples: string[] = [];
  eachString(doc, (s) => {
    let depth = 0;
    for (const ch of s) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
    if (depth !== 0) {
      braces++;
      if (braceSamples.length < 3)
        braceSamples.push(s.length > 80 ? `${s.slice(0, 77)}…` : s);
    }
    if (/[\n\t\r]/.test(s)) escapes++;
  });
  if (braces)
    add(
      'error',
      'content.braces',
      `${braces} string${braces === 1 ? ' has' : 's have'} mismatched { } braces, e.g. "${braceSamples.join('" / "')}"`,
      'test:file-contents',
    );
  if (escapes)
    add(
      'error',
      'content.escapes',
      `${escapes} string${escapes === 1 ? ' contains' : 's contain'} a raw newline/tab — split into separate entries instead`,
      'test:file-contents',
    );

  // --- formatting (the cleaner's canonical output) ------------------------------------------------------
  if (input.raw != null) {
    if (/^ {2}"/m.test(input.raw) && !/^\t"/m.test(input.raw))
      add(
        'info',
        'format.indent',
        'the repo formats with tab indentation — the cleaner will reindent this file',
        'test:clean',
      );
    if (/[—–‑−  “”]/.test(input.raw))
      add(
        'info',
        'format.chars',
        'contains raw typographic characters (em dash, curly quotes, nbsp…) the cleaner rewrites to escapes',
        'test:clean',
      );
  }

  // --- repo folder (BrewTesterFileProps) -----------------------------------------------------------------
  const primary = contentProps.filter((p) => !SUPPORT_PROPS.test(p));
  const dirs = [
    ...new Set(
      (primary.length ? primary : contentProps).map((p) => PROP_TO_DIR[p] ?? p),
    ),
  ];
  const folder =
    dirs.length === 1 ? dirs[0] : dirs.length > 1 ? 'collection' : null;
  if (folder && folder !== 'collection') {
    const need = DIR_TO_PRIMARY_PROP[folder] ?? [folder];
    const lacking = need.filter((p) => !contentProps.includes(p));
    if (lacking.length)
      add(
        'error',
        'folder.primaryProp',
        `a file in "${folder}/" must contain ${lacking.map((p) => `"${p}"`).join(' and ')}`,
        'test:file-props',
      );
  }
  if (folder)
    add(
      'info',
      'folder',
      `submit to the "${folder}/" folder${folder === 'collection' ? ` (mixes ${dirs.join(', ')})` : ''}`,
    );

  return finish(file, issues, folder);
}

function finish(
  file: string,
  issues: LintIssue[],
  folder: string | null,
): LintReport {
  const rank = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    file,
    issues,
    folder,
    totals: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      infos: issues.filter((i) => i.severity === 'info').length,
    },
  };
}
