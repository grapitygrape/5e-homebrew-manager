/**
 * scripts/lib/upstream-git.ts — what `upstream:check` and `upstream:update`
 * read from the checkouts. Everything here reads git refs and writes only to
 * temp folders; the working trees are never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { ROOT, localSource, storePath, stored } from './config.ts';
import {
  enumChanges,
  isGenerated,
  mergeConflicts,
  parseCatFileBatch,
  patchApplies,
  patchBase,
  resolveModuleSource,
  staleLists,
  type StaleList,
} from './upstream.ts';
import type { SchemaMap } from '../../src/lib/engine/audit/schema.ts';
import {
  moduleValues,
  type ModuleOptionDef,
} from '../../src/lib/engine/deploy-modules/apply.ts';
import { siteRoot } from '../../customizer/scripts/paths.mjs';

export const MODULES_DIR = path.join(ROOT, 'deploy-modules');
export const CUSTOMIZER_DIR = path.join(ROOT, 'customizer');

/** A setup problem: the scripts exit 2 on one, not 1. */
export class SetupError extends Error {}

// --- git --------------------------------------------------------------------

export const git = (repo: string, args: string[]): string =>
  execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    maxBuffer: 2e9,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
export const tryGit = (repo: string, args: string[]): string | null => {
  try {
    return git(repo, args);
  } catch {
    return null;
  }
};

const showCache = new Map<string, string | null>();
export const clearShowCache = (): void => {
  showCache.clear();
};

export const show = (repo: string, ref: string, file: string): string | null => {
  const key = `${repo}\0${ref}\0${file}`;
  if (showCache.has(key)) return showCache.get(key) ?? null;
  const content = tryGit(repo, ['show', `${ref}:${file}`]);
  showCache.set(key, content);
  return content;
};

/**
 * Load every `.json` file under `schemaRel` at `utilsRef` in a single
 * `git cat-file --batch` call instead of spawning `git show` per file.
 * Populates the `show()` cache as well so follow-up checks reuse the blobs.
 */
export function loadSchemasAtRef(
  utilsRepo: string,
  utilsRef: string,
  schemaRel: string,
  onBadJson?: (key: string) => void,
): { schemas: SchemaMap; badJson: number } {
  const listArgs = [
    'ls-tree',
    '-r',
    '-z',
    '--format=%(objectname)\t%(path)',
    utilsRef,
  ];
  if (schemaRel && schemaRel !== '.') listArgs.push('--', schemaRel);

  const listed = git(utilsRepo, listArgs)
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t');
      return { oid: line.slice(0, tab), file: line.slice(tab + 1) };
    })
    .filter((entry) => entry.file.endsWith('.json'));

  const schemas: SchemaMap = {};
  let badJson = 0;
  if (!listed.length) return { schemas, badJson };

  const res = spawnSync('git', ['-C', utilsRepo, 'cat-file', '--batch'], {
    input: listed.map((e) => e.oid).join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(
      `git cat-file --batch failed in ${utilsRepo}: ${res.stderr?.toString('utf8') ?? ''}`,
    );
  }

  const blobs = parseCatFileBatch(
    res.stdout as Buffer,
    listed.map((e) => e.file),
  );
  const relBase = schemaRel === '.' ? '' : schemaRel;
  for (const { file } of listed) {
    const text = blobs.get(file);
    if (text === undefined) continue;
    showCache.set(`${utilsRepo}\0${utilsRef}\0${file}`, text);
    const key = relBase ? toPosix(path.posix.relative(relBase, file)) : file;
    try {
      schemas[key] = JSON.parse(text);
    } catch {
      badJson++;
      onBadJson?.(key);
    }
  }
  return { schemas, badJson };
}

export const hasRef = (repo: string, ref: string) =>
  tryGit(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !==
  null;
export const revParse = (repo: string, ref: string) =>
  git(repo, ['rev-parse', `${ref}^{commit}`]).trim();
const repoRoot = (dir: string) =>
  git(dir, ['rev-parse', '--show-toplevel']).trim();
const toPosix = (p: string) => p.split(path.sep).join('/');
const names = (out: string | null) => (out ?? '').split('\n').filter(Boolean);

export const pkgVersion = (repo: string, ref: string): string =>
  JSON.parse(show(repo, ref, 'package.json') ?? '{}').version ?? '?';

/** The 5etools-utils version a site commit's package.json asks for, without its range prefix. */
const wantedUtilsAt = (siteRepo: string, ref: string): string =>
  (
    JSON.parse(show(siteRepo, ref, 'package.json') ?? '{}').devDependencies?.[
      '5etools-utils'
    ] ?? ''
  ).replace(/^[\^~]/, '');

const utilsTag = (utilsRepo: string, version: string) =>
  [`v${version}`, version].find((r) => version && hasRef(utilsRepo, r));

// --- targets ------------------------------------------------------------------

export interface Targets {
  dataDir: string;
  guidesDir: string;
  siteRepo: string;
  utilsRepo: string;
  /** The brew schema folder, relative to the utils repo. */
  schemaRel: string;
  /** The site ref Prepare would build, and its commit. */
  siteRef: string;
  target: string;
  /** The utils version the target asks for, and the ref that matches it. */
  wantedUtils: string;
  utilsRef: string;
  /** The utils ref the current site asks for: the guides were last checked against it. */
  utilsFrom: string;
}

function localDir(key: 'data' | 'schema' | 'guides'): string {
  const found = localSource(key);
  if ('dir' in found) return found.dir;
  throw new SetupError(found.problem);
}

/**
 * The versions an update moves to, picked as Prepare picks them: the 5e
 * branch's upstream, and the utils tag that version's package.json asks for.
 */
export function resolveTargets(opts: {
  fetch: boolean;
  siteRef?: string;
  utilsRef?: string;
  log?: (msg: string) => void;
}): Targets {
  const dataDir = localDir('data');
  const schemaDir = localDir('schema');
  const guidesDir = localDir('guides');
  const siteRepo = repoRoot(dataDir);
  const utilsRepo = repoRoot(schemaDir);
  if (opts.fetch) {
    for (const repo of [siteRepo, utilsRepo]) {
      opts.log?.(`Fetching ${repo} …`);
      git(repo, ['fetch', '--tags', '--quiet', 'origin']);
    }
  }
  const siteRef =
    opts.siteRef ??
    tryGit(siteRepo, ['rev-parse', '--abbrev-ref', '@{upstream}'])?.trim() ??
    'origin/HEAD';
  if (!hasRef(siteRepo, siteRef))
    throw new SetupError(`5etools ref not found: ${siteRef}`);
  const wantedUtils = wantedUtilsAt(siteRepo, siteRef);
  const utilsRef =
    opts.utilsRef ?? utilsTag(utilsRepo, wantedUtils) ?? 'origin/HEAD';
  if (!hasRef(utilsRepo, utilsRef))
    throw new SetupError(`5etools-utils ref not found: ${utilsRef}`);
  return {
    dataDir,
    guidesDir,
    siteRepo,
    utilsRepo,
    schemaRel: toPosix(path.relative(utilsRepo, schemaDir)),
    siteRef,
    target: revParse(siteRepo, siteRef),
    wantedUtils,
    utilsRef,
    utilsFrom: utilsTag(utilsRepo, wantedUtilsAt(siteRepo, 'HEAD')) ?? 'HEAD',
  };
}

/**
 * True when there's nothing new to update to: 5e is at its target and utils
 * already has the tag it asks for. A utils checkout ahead of that tag isn't a
 * new release, so a scheduled run stays quiet about it.
 */
export function upToDate(t: Targets): boolean {
  const behind = (repo: string, ref: string) =>
    git(repo, ['rev-list', '--count', `HEAD..${ref}`]).trim() !== '0';
  return !behind(t.siteRepo, t.target) && !behind(t.utilsRepo, t.utilsRef);
}

// --- deploy modules: diff entries ------------------------------------------------

interface ModuleDef {
  defaultEnabled?: boolean;
  options?: ModuleOptionDef[];
  entries?: { type?: string; source?: string; description?: string }[];
}

export interface DiffEntryCheck {
  module: string;
  description: string;
  enabled: boolean;
  /** The resolved patch file, or null when its option is unset. */
  file: string | null;
  exists: boolean;
  applies: boolean;
  errors: string[];
  /** The upstream version the patch says it was built on. */
  builtOn: { describe: string; commit: string } | null;
}

/**
 * Every `diff` entry (the Reskin package), tested with a plain `git apply` against
 * the target's files, as Prepare will apply it.
 */
export function diffEntryChecks(t: Targets): DiffEntryCheck[] {
  const saved =
    (stored.deploy as { modules?: Record<string, never> } | undefined)
      ?.modules ?? {};
  const out: DiffEntryCheck[] = [];
  for (const id of fs.readdirSync(MODULES_DIR).sort()) {
    const moduleDir = path.join(MODULES_DIR, id);
    const manifest = path.join(moduleDir, 'module.json');
    if (!fs.existsSync(manifest)) continue;
    const def = JSON.parse(fs.readFileSync(manifest, 'utf8')) as ModuleDef;
    const { enabled, values } = moduleValues(def, saved[id]);
    for (const e of def.entries ?? []) {
      if (e.type !== 'diff' || !e.source) continue;
      const file = resolveModuleSource(e.source, {
        moduleDir,
        dataDir: path.dirname(storePath),
        managerDir: ROOT,
        values,
      });
      const check: DiffEntryCheck = {
        module: id,
        description: e.description ?? e.source,
        enabled,
        file,
        exists: !!file && fs.existsSync(file),
        applies: false,
        errors: [],
        builtOn: null,
      };
      if (check.exists) {
        const patch = fs.readFileSync(file!, 'utf8');
        check.builtOn = patchBase(patch);
        const res = patchApplies(patch, (f) => show(t.siteRepo, t.target, f));
        check.applies = res.ok;
        check.errors = res.errors;
      }
      out.push(check);
    }
  }
  return out;
}

// --- customizer ------------------------------------------------------------------

export interface CustomizerFile {
  file: string;
  generated: boolean;
  conflicts: number;
}

export interface CustomizerState {
  site: string;
  /** The upstream commit our edits are on, from customizer/upstream.json. */
  base: string;
  baseDescribe: string;
  atTarget: boolean;
  /** Files both our commits and upstream changed since the base. */
  files: CustomizerFile[];
}

export const customizerSite = (): string => siteRoot();

/**
 * Trial-merges each file our commits in the customizer site and upstream both
 * changed, from committed text only, as a rebase onto the target would.
 */
export function customizerState(t: Targets): CustomizerState | null {
  const site = customizerSite();
  const upstreamJson = path.join(CUSTOMIZER_DIR, 'upstream.json');
  if (!fs.existsSync(path.join(site, '.git')) || !fs.existsSync(upstreamJson))
    return null;
  const { commit: base, describe } = JSON.parse(
    fs.readFileSync(upstreamJson, 'utf8'),
  );
  if (!hasRef(t.siteRepo, base))
    throw new SetupError(
      `the customizer's base ${base} isn't in ${t.siteRepo}; fetch it`,
    );
  const atTarget = revParse(t.siteRepo, base) === t.target;
  const ours = new Set(
    names(tryGit(site, ['diff', '--name-only', base, 'HEAD'])),
  );
  const theirs = names(
    git(t.siteRepo, ['diff', '--name-only', base, t.target]),
  );
  const files = atTarget
    ? []
    : theirs
        .filter((f) => ours.has(f))
        .sort()
        .map((file) => {
          if (isGenerated(file)) return { file, generated: true, conflicts: 0 };
          const [o, b, th] = [
            show(site, 'HEAD', file),
            show(t.siteRepo, base, file),
            show(t.siteRepo, t.target, file),
          ];
          // Added or deleted on one side: a rebase stops on it either way.
          const conflicts =
            o === null || b === null || th === null
              ? 1
              : mergeConflicts(o, b, th);
          return { file, generated: false, conflicts };
        });
  return { site, base, baseDescribe: describe, atTarget, files };
}

// --- schemas against the guides ------------------------------------------------------

/** The brew schema files that changed between two utils refs, parsed at each. */
function changedSchemas(t: Targets, from: string, to: string) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const files = names(
    git(t.utilsRepo, ['diff', '--name-only', from, to, '--', t.schemaRel]),
  ).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const rel = toPosix(path.posix.relative(t.schemaRel, file));
    const parse = (ref: string) => {
      const text = show(t.utilsRepo, ref, file);
      return text === null ? undefined : JSON.parse(text);
    };
    before[rel] = parse(from);
    after[rel] = parse(to);
  }
  return { files, before, after };
}

/** Hand-typed guide lists that the schema change from `utilsFrom` to `utilsRef` made stale. */
export function guideListDrift(t: Targets): {
  schemaFiles: string[];
  stale: StaleList[];
} {
  const { files, before, after } = changedSchemas(t, t.utilsFrom, t.utilsRef);
  const guides: Record<string, string> = {};
  for (const name of fs
    .readdirSync(t.guidesDir)
    .filter((f) => f.endsWith('.md')))
    guides[name] = fs.readFileSync(path.join(t.guidesDir, name), 'utf8');
  return {
    schemaFiles: files,
    stale: staleLists(enumChanges(before, after), guides),
  };
}
