/**
 * scripts/upstream-check.ts — what would a new 5etools release break here?
 *
 * WHY THIS EXISTS
 *   Every other check (`npm run audit`, `guides:enums`, the pipeline dry run)
 *   reads the checkouts as they are, so drift only shows up after the update.
 *   This one reads the upstream refs straight from git, without touching any
 *   working tree, and runs the same checks against them first.
 *
 * WHAT IT CHECKS, against the upstream refs
 *   1. Versions: how far the 5etools and 5etools-utils checkouts are behind.
 *   2. Guide coverage (`npm run audit`) against the upstream brew schemas.
 *   3. Generated guide lists (`npm run guides:enums`) against those schemas.
 *   4. Hand-typed guide lists: lines that list a schema enum's old values but
 *      not the ones it gained, which checks 2 and 3 can't see.
 *   5. Deploy-module patches: every anchor still matches upstream, compared
 *      with what it matched at HEAD (the same text a pipeline run patches).
 *   6. Diff entries (the Reskin package): each applies with a plain
 *      `git apply` to the upstream files, as Prepare applies it.
 *   7. The customizer site: a trial merge of each file both our commits and
 *      upstream changed, as rebasing onto the new release would.
 *   8. 5etools identifiers the modules' JS and site-browser.js use that exist
 *      at HEAD but are gone upstream (a rename that would break a page).
 *   9. Styling (report only): upstream SCSS and template changes, and new
 *      component classes in its JS, for a theme review.
 *
 * USAGE
 *   npm run upstream:check                   # fetch, then check
 *   npm run upstream:check -- --no-fetch     # use what was fetched last
 *   npm run upstream:check -- --if-new       # silent unless there's a release to update to
 *   npm run upstream:check -- --site-ref=v2.41.0 --utils-ref=v0.17.34
 *
 *   The site ref defaults to the 5etools branch's upstream (origin/main). The
 *   utils ref defaults to the version that site ref's package.json asks for,
 *   tag `v<version>` as the app's "Match 5etools-utils" does, else origin/HEAD.
 *   Exits 1 if anything needs attention, 2 on a setup problem. See README
 *   "Updating 5etools".
 *
 * CONFIG — as scripts/audit.ts (scripts/lib/config.ts): hbm-config.json →
 *   HBM_*_PATH env vars → defaults. `data` and `schema` must be local paths
 *   inside the 5etools and 5etools-utils git checkouts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/config.ts';
import { applyPatch, type Patch } from '../src/lib/engine/deploy-modules/apply.ts';
import { newComponentClasses } from './lib/upstream.ts';
import {
  formatGuideAudit,
  runGuideAudit,
  runGuideEnums,
} from './lib/guide-checks.ts';
import {
  CUSTOMIZER_DIR,
  MODULES_DIR,
  SetupError,
  customizerState,
  diffEntryChecks,
  git,
  guideListDrift,
  loadSchemasAtRef,
  pkgVersion,
  resolveTargets,
  show,
  tryGit,
  upToDate,
  type Targets,
} from './lib/upstream-git.ts';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const SITE_BROWSER_JS = path.join(ROOT, 'src-tauri', 'src', 'site-browser.js');
const ifNew = flag('if-new');

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(2);
}

// --- setup ------------------------------------------------------------------

let t: Targets;
try {
  t = resolveTargets({
    fetch: !flag('no-fetch'),
    siteRef: opt('site-ref'),
    utilsRef: opt('utils-ref'),
    log: ifNew ? undefined : console.log,
  });
} catch (e) {
  if (e instanceof SetupError) fail(e.message);
  throw e;
}
const { siteRepo, utilsRepo, siteRef, utilsRef } = t;

// A scheduled run only speaks up when there's something to update to.
if (ifNew && upToDate(t)) process.exit(0);

let problems = 0;
const section = (title: string) => console.log(`\n== ${title}`);
const printIndented = (lines: string[]) => {
  const out = lines.join('\n').trim();
  if (out) console.log(out.replace(/^/gm, '  '));
};

// --- 1. versions ------------------------------------------------------------

section('Versions');
for (const [label, repo, ref] of [
  ['5etools', siteRepo, siteRef],
  ['5etools-utils', utilsRepo, utilsRef],
] as const) {
  const behind = git(repo, ['rev-list', '--count', `HEAD..${ref}`]).trim();
  console.log(
    `${label.padEnd(14)} ${pkgVersion(repo, 'HEAD')} → ${pkgVersion(repo, ref)} (${ref}, ${behind} commit(s) behind)  ${repo}`,
  );
}
if (t.wantedUtils)
  console.log(`${siteRef} asks for 5etools-utils ${t.wantedUtils}`);

// --- 2 & 3. guides against the upstream schemas ------------------------------

const badSchemaLines: string[] = [];
const { schemas, badJson } = loadSchemasAtRef(
  utilsRepo,
  utilsRef,
  t.schemaRel,
  (key) => badSchemaLines.push(`! unparseable schema: ${key}`),
);

section(`Guide coverage against 5etools-utils ${utilsRef}`);
const auditReport = runGuideAudit(schemas, t.guidesDir, badJson);
printIndented([
  ...badSchemaLines,
  ...formatGuideAudit(auditReport, { quiet: true }),
]);
if (auditReport.problems) problems++;

section(`Generated guide lists against 5etools-utils ${utilsRef}`);
const enumReport = runGuideEnums(schemas, t.guidesDir);
printIndented(enumReport.lines);
// A stale list is expected after a schema change and regenerates after the
// update; only a list the script can't render needs fixing first.
if (enumReport.unknown > 0) problems++;
else if (enumReport.stale > 0)
  console.log(
    '  (nothing to fix now: `npm run guides:enums -- --write` after updating)',
  );

// --- 4. hand-typed guide lists -------------------------------------------------

section(`Hand-typed guide lists, 5etools-utils ${t.utilsFrom} → ${utilsRef}`);
const drift = guideListDrift(t);
if (!drift.schemaFiles.length) console.log('  ✔ no schema changes');
else {
  for (const s of drift.stale) {
    const what = [
      s.missing.length &&
        `missing ${s.missing.map((v) => `"${v}"`).join(', ')}`,
      s.stillListed.length &&
        `still lists removed ${s.stillListed.map((v) => `"${v}"`).join(', ')}`,
    ]
      .filter(Boolean)
      .join('; ');
    console.log(
      `  ✖ ${s.guide}:${s.line} — ${what} (${s.change.file}#${s.change.pointer})`,
    );
  }
  if (drift.stale.length) {
    console.log(
      '  Fix the list, or make it generated: add its schema path to ENUMS in guide-enums.ts.',
    );
    problems++;
  } else
    console.log(
      `  ✔ no hand-typed list misses a value (${drift.schemaFiles.length} schema file(s) changed)`,
    );
}

// --- 5. deploy-module patches -------------------------------------------------

interface Entry {
  type?: string;
  target?: string;
  patches?: Patch[];
}

// Rust's regex crate spells named groups (?P<name>…); JS wants (?<name>…).
const jsRegex = (src: string, flags = '') =>
  new RegExp(
    src.replace(/\(\?P</g, '(?<'),
    `g${[...'ims'].filter((c) => flags.includes(c)).join('')}`,
  );

/** How many places this patch's anchor matches, as pipeline.rs would look for it. */
function matches(text: string, p: Patch): number {
  if (p.ensureArrayItems)
    return text.includes(`${p.ensureArrayItems.arrayKey ?? ''}:`) ? 1 : 0;
  if (p.insertFile) {
    if ((p.position ?? 'end') === 'end') return 1;
    return p.find ? text.split(p.find).length - 1 : 0;
  }
  if (p.contains) {
    const re = p.isRegex ? jsRegex(p.contains) : null;
    return text
      .split('\n')
      .filter((l) =>
        re ? ((re.lastIndex = 0), re.test(l)) : l.includes(p.contains!),
      ).length;
  }
  const find = p.find ?? '';
  if (!find) return 0;
  return p.isRegex
    ? [...text.matchAll(jsRegex(find, p.flags))].length
    : text.split(find).length - 1;
}

/** Later patches can anchor on earlier inserts, so apply each in order, as Prepare does. */
function apply(text: string, p: Patch, mod: string): string {
  const readInsert = (name: string) =>
    fs.readFileSync(path.join(MODULES_DIR, mod, name), 'utf8');
  return applyPatch(text, p, {}, readInsert)?.text ?? text;
}

section(`Deploy-module patches against 5etools ${siteRef}`);
const modules = fs
  .readdirSync(MODULES_DIR)
  .filter((d) => fs.existsSync(path.join(MODULES_DIR, d, 'module.json')))
  .sort();
let patchCount = 0;
let patchProblems = 0;
for (const mod of modules) {
  const { entries = [] } = JSON.parse(
    fs.readFileSync(path.join(MODULES_DIR, mod, 'module.json'), 'utf8'),
  ) as { entries?: Entry[] };
  for (const e of entries) {
    if (!e.target) continue;
    if (e.type === 'copy') {
      // Copying over a site file throws away whatever upstream changed in it.
      const before = show(siteRepo, 'HEAD', e.target);
      if (before !== null && before !== show(siteRepo, siteRef, e.target)) {
        console.log(
          `  ✖ [${mod}] copy replaces ${e.target}, which changed upstream`,
        );
        patchProblems++;
      }
      continue;
    }
    if (e.type !== 'patch') continue;
    let head = show(siteRepo, 'HEAD', e.target);
    let next = show(siteRepo, siteRef, e.target);
    if (next === null) {
      console.log(`  ✖ [${mod}] ${e.target} no longer exists upstream`);
      patchProblems++;
      continue;
    }
    for (const [i, p] of (e.patches ?? []).entries()) {
      patchCount++;
      const was = head === null ? 0 : matches(head, p);
      const now = matches(next, p);
      const label = `[${mod}] ${e.target} — ${p.note || `patch #${i + 1}`}`;
      if (now === 0 && was > 0) {
        console.log(
          `  ✖ ${label}: matched ${was}× at HEAD, no match upstream${p.allowMissing ? ' (allowMissing: it would be skipped)' : ''}`,
        );
        patchProblems++;
      } else if (now !== was) {
        console.log(`  ! ${label}: matched ${was}× at HEAD, ${now}× upstream`);
      }
      if (head !== null) head = apply(head, p, mod);
      next = apply(next, p, mod);
    }
  }
}
console.log(
  patchProblems
    ? `  ${patchProblems} problem(s) in ${patchCount} patch(es) across ${modules.length} module(s)`
    : `  ✔ all ${patchCount} patch(es) across ${modules.length} module(s) still match`,
);
if (patchProblems) problems++;

// --- 6. diff entries (the Reskin package) ----------------------------------------

section(`Diff entries against 5etools ${siteRef}`);
const targetDescribe =
  tryGit(siteRepo, ['describe', '--tags', t.target])?.trim() ??
  t.target.slice(0, 7);
let diffProblems = 0;
for (const d of diffEntryChecks(t)) {
  const label = `[${d.module}] ${d.description}`;
  const state = d.enabled ? '' : ' (module off)';
  if (!d.exists) {
    console.log(
      `  ${d.enabled ? '✖' : '·'} ${label}: no patch at ${d.file ?? 'its unset option'}${state}`,
    );
    if (d.enabled) diffProblems++;
    continue;
  }
  const built = d.builtOn
    ? t.target.startsWith(d.builtOn.commit)
      ? ''
      : `; built on ${d.builtOn.describe}, Prepare builds ${targetDescribe}`
    : '';
  if (d.applies) console.log(`  ✔ ${label} applies${built}${state}`);
  else {
    console.log(
      `  ${d.enabled ? '✖' : '·'} ${label} doesn't apply${built}${state}`,
    );
    for (const err of d.errors) console.log(`      ${err}`);
    if (d.enabled) diffProblems++;
  }
}
if (diffProblems) {
  console.log(
    '  Update the customizer and export again: `npm run upstream:update`.',
  );
  problems++;
}

// --- 7. customizer site ------------------------------------------------------------

section(`Customizer site rebased onto ${targetDescribe}`);
const cust = (() => {
  try {
    return customizerState(t);
  } catch (e) {
    if (e instanceof SetupError) {
      console.log(`  ✖ ${e.message}`);
      problems++;
      return undefined;
    }
    throw e;
  }
})();
if (cust === null) console.log('  · no customizer site set up; skipped');
else if (cust?.atTarget) console.log(`  ✔ already on ${targetDescribe}`);
else if (cust) {
  const manual = cust.files.filter((f) => !f.generated);
  const conflicted = manual.filter((f) => f.conflicts);
  const generated = cust.files.length - manual.length;
  console.log(
    `  ${cust.files.length} file(s) changed on both sides since ${cust.baseDescribe}: ${manual.length} source, ${generated} generated (the build regenerates these)`,
  );
  for (const f of conflicted)
    console.log(`  ✖ ${f.file}: ${f.conflicts} conflict(s) to merge by hand`);
  if (conflicted.length) problems++;
  else console.log('  ✔ every source file merges cleanly');
}

// --- 8. identifiers the modules call -------------------------------------------

section(`5etools names our scripts use, against ${siteRef}`);
const words = (ref: string) =>
  new Set(
    git(siteRepo, [
      'grep',
      '-h',
      '-o',
      '-E',
      '[A-Za-z_$][A-Za-z0-9_$]*',
      ref,
      '--',
      'js/',
    ])
      .split('\n')
      .map((l) => l.replace(/^[^:]*:/, '')),
  );
const headWords = words('HEAD');
const nextWords = words(siteRef);
const scripts: [string, string[]][] = modules.map((mod) => [
  mod,
  fs
    .readdirSync(path.join(MODULES_DIR, mod))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(MODULES_DIR, mod, f)),
]);
scripts.push(['site-browser', [SITE_BROWSER_JS]]);
let gone = 0;
for (const [name, files] of scripts) {
  const used = new Set<string>();
  for (const f of files) {
    // Comments are prose, and their words would match 5etools comments.
    const src = fs
      .readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    for (const m of src.matchAll(/\.([A-Za-z_$][A-Za-z0-9_$]{2,})/g))
      used.add(m[1]);
    for (const m of src.matchAll(/\b([A-Z][A-Za-z0-9_]{2,})\b/g))
      used.add(m[1]);
  }
  // Only names 5etools defined at HEAD and dropped since: ours and the browser's never count.
  const missing = [...used].filter(
    (w) => headWords.has(w) && !nextWords.has(w),
  );
  if (missing.length) {
    console.log(
      `  ✖ [${name}] no longer in upstream js/: ${missing.sort().join(', ')}`,
    );
    gone++;
  }
}
if (gone) problems++;
else console.log('  ✔ every name the scripts use still exists upstream');

// --- 9. styling (report only) ------------------------------------------------------

section(`Styling changes upstream, for a theme review`);
const styleFiles = git(siteRepo, [
  'diff',
  '--name-only',
  'HEAD',
  t.target,
  '--',
  'scss',
  'node/generate-pages/template',
])
  .split('\n')
  .filter(Boolean);
const shellCss = fs
  .readdirSync(path.join(CUSTOMIZER_DIR, 'shell'))
  .filter((f) => f.endsWith('.css'))
  .map((f) => fs.readFileSync(path.join(CUSTOMIZER_DIR, 'shell', f), 'utf8'))
  .join('\n');
const classes = newComponentClasses(
  git(siteRepo, [
    'diff',
    'HEAD',
    t.target,
    '--',
    'js',
    'node/generate-pages/template',
  ]),
).filter((c) => !shellCss.includes(c));
if (!styleFiles.length && !classes.length) console.log('  ✔ nothing to review');
for (const f of styleFiles) console.log(`  · ${f} changed`);
if (classes.length)
  console.log(
    `  · new component classes the shell doesn't style: ${classes.join(', ')}`,
  );

// --- summary -------------------------------------------------------------------

console.log(
  problems
    ? `\n✖ ${problems} check(s) need attention before updating to ${siteRef}. See README "Updating 5etools".`
    : `\n✔ ready to update to 5etools ${siteRef} / 5etools-utils ${utilsRef}.`,
);
process.exit(problems ? 1 : 0);
