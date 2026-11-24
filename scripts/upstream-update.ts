/**
 * scripts/upstream-update.ts — move the customizer site and the Reskin package
 * to a new 5etools release, when that can be done without a person.
 *
 * WHAT IT DOES
 *   1. Finds the target as `upstream:check` does: the 5etools commit Prepare
 *      will build next.
 *   2. Stops before changing anything unless the customizer site has no
 *      uncommitted tracked changes and every source file our commits and
 *      upstream both changed merges cleanly.
 *   3. Rebases the site onto the target. A conflict in a generated file (pages,
 *      css/*.css, search/*.json) takes upstream's side; the build regenerates it.
 *      Any other conflict aborts the rebase and stops.
 *   4. Runs the customizer's build. Regenerated files are committed in the site;
 *      a change to any other file stops the run.
 *   5. Runs save-patch and export, then checks the new Reskin package applies
 *      to the target with a plain `git apply`, as Prepare will apply it.
 *   6. Pushes the site to its `origin`. The rebase rewrites the branch, so this
 *      is `--force-with-lease` against the commit `origin` had before.
 *   7. Optional `--refresh-enums`: rewrites generated guide enum lists against
 *      the target `5etools-utils` schemas in-process.
 *   8. Optional `--check-pages`: starts `customizer/shell/dev-server.mjs`
 *      ephemerally, runs `shell/check.mjs` on pages touched by the upstream
 *      diff (1920px & 390px), and shuts the server down cleanly.
 *
 * USAGE
 *   npm run upstream:update                  # fetch, update, push
 *   npm run upstream:update -- --no-fetch    # use what was fetched last
 *   npm run upstream:update -- --no-push     # leave the site unpushed
 *   npm run upstream:update -- --refresh-enums --check-pages
 *   npm run upstream:update -- --site-ref=v2.41.1
 *
 *   Exits 1 when it stops for a person, 2 on a setup problem. When it stops,
 *   nothing after the step it names has run.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { isGenerated, touchedPages } from './lib/upstream.ts';
import { runGuideEnums } from './lib/guide-checks.ts';
import {
  CUSTOMIZER_DIR,
  SetupError,
  customizerState,
  diffEntryChecks,
  git,
  hasRef,
  loadSchemasAtRef,
  resolveTargets,
  revParse,
  tryGit,
  type Targets,
} from './lib/upstream-git.ts';

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const step = (title: string) => console.log(`\n== ${title}`);
const names = (out: string | null) => (out ?? '').split('\n').filter(Boolean);

function stop(message: string, code = 1): never {
  console.error(`\n✖ ${message}`);
  process.exit(code);
}

/** Runs a command, echoing its output; returns whether it succeeded. */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): boolean {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && cmd === 'npm',
    env: { ...process.env, ...env },
  });
  return res.status === 0;
}

/** git in the site, without throwing: the rebase steps read the exit status. */
function siteGit(site: string, args: string[]) {
  return spawnSync('git', ['-C', site, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_EDITOR: 'true' },
  });
}

/** Reserve an ephemeral localhost port for the temporary dev server. */
function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        srv.close(() => reject(new Error('Could not bind an ephemeral port')));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server still starting.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runPageCheck(
  site: string,
  changedUpstream: string[],
): Promise<boolean> {
  const existingPages = fs
    .readdirSync(site)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''));
  const pages = touchedPages(changedUpstream, existingPages);
  if (!pages.length) {
    console.log('  ✔ no HTML pages to check');
    return true;
  }
  console.log(`  checking ${pages.length} page(s): ${pages.join(', ')}`);

  const port = await pickFreePort();
  const baseUrl = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ['shell/dev-server.mjs'], {
    cwd: CUSTOMIZER_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverErr = '';
  server.stderr?.on('data', (chunk) => {
    serverErr += String(chunk);
  });

  try {
    await waitForServer(`${baseUrl}__module-warnings`);
    return run(
      process.execPath,
      [
        'shell/check.mjs',
        `--base=${baseUrl}`,
        `--pages=${pages.join(',')}`,
        '--widths=1920,390',
      ],
      CUSTOMIZER_DIR,
    );
  } catch (e) {
    const detail = serverErr.trim() ? `\n${serverErr.trim()}` : '';
    stop(`Dev server failed during --check-pages: ${(e as Error).message}${detail}`);
  } finally {
    server.kill();
  }
}

// --- 1. target --------------------------------------------------------------------

let t: Targets;
try {
  t = resolveTargets({
    fetch: !flag('no-fetch'),
    siteRef: opt('site-ref'),
    log: console.log,
  });
} catch (e) {
  if (e instanceof SetupError) stop(e.message, 2);
  throw e;
}
const targetDescribe =
  tryGit(t.siteRepo, ['describe', '--tags', t.target])?.trim() ??
  t.target.slice(0, 7);

const state = customizerState(t);
if (!state)
  stop(
    'No customizer site set up. Run `npm run setup` in customizer/ first.',
    2,
  );
const { site } = state;
console.log(`Customizer site: ${site}`);
console.log(
  `Target: 5etools ${targetDescribe} (${t.target.slice(0, 7)}), Prepare's next build`,
);

const upstreamChangedFiles = names(
  git(t.siteRepo, ['diff', '--name-only', state.base, t.target]),
);

// --- 2. preconditions ----------------------------------------------------------------

step('Checking the site');
const branch = tryGit(site, ['symbolic-ref', '--short', 'HEAD'])?.trim();
if (!branch) stop(`${site} isn't on a branch. Check out its branch first.`);
const dirty = names(
  git(site, ['status', '--porcelain', '--untracked-files=no']),
);
if (dirty.length)
  stop(
    `The site has uncommitted changes. Commit them first:\n${dirty.map((l) => `  ${l}`).join('\n')}`,
  );
if (!flag('no-fetch')) git(site, ['fetch', '--tags', '--quiet', 'upstream']);
if (!hasRef(site, t.target))
  stop(
    `The site's \`upstream\` remote doesn't have ${t.target.slice(0, 7)}. It should be the official 5etools repo.`,
    2,
  );
const originBefore = tryGit(site, [
  'rev-parse',
  '--verify',
  '--quiet',
  `origin/${branch}`,
])?.trim();
console.log(`  ✔ on ${branch}, nothing uncommitted`);

// --- 3. rebase -------------------------------------------------------------------------

const onTarget =
  siteGit(site, ['merge-base', '--is-ancestor', t.target, 'HEAD']).status === 0;
if (onTarget) {
  step(`Rebase: the site is already on ${targetDescribe}`);
} else {
  const conflicted = state.files.filter((f) => !f.generated && f.conflicts);
  if (conflicted.length)
    stop(
      `These files need a hand merge, so the site wasn't touched:\n${conflicted
        .map((f) => `  ${f.file} (${f.conflicts} conflict(s))`)
        .join(
          '\n',
        )}\nRebase by hand (the update-5etools skill covers it), then rerun this.`,
    );

  step(`Rebasing ${branch} onto ${targetDescribe}`);
  let res = siteGit(site, ['rebase', t.target]);
  while (res.status !== 0) {
    const files = names(git(site, ['diff', '--name-only', '--diff-filter=U']));
    const manual = files.filter((f) => !isGenerated(f));
    if (!files.length || manual.length) {
      siteGit(site, ['rebase', '--abort']);
      stop(
        manual.length
          ? `The rebase hit conflicts in source files, so it was aborted:\n${manual.map((f) => `  ${f}`).join('\n')}`
          : `The rebase stopped and was aborted:\n${res.stderr}`,
      );
    }
    for (const f of files) {
      // During a rebase, stage 2 is the side being rebased onto: upstream's.
      const up = spawnSync('git', ['-C', site, 'show', `:2:${f}`], {
        maxBuffer: 2e9,
      });
      if (up.status === 0) {
        fs.writeFileSync(path.join(site, f), up.stdout);
        git(site, ['add', '--', f]);
      } else git(site, ['rm', '--quiet', '--', f]);
      console.log(`  took upstream's ${f}; the build regenerates it`);
    }
    // A commit that only touched generated files has nothing left to apply.
    const empty = siteGit(site, ['diff', '--cached', '--quiet']).status === 0;
    res = siteGit(site, ['rebase', empty ? '--skip' : '--continue']);
  }
  console.log(`  ✔ rebased onto ${targetDescribe}`);
}

// --- 4. build ----------------------------------------------------------------------------

step('Building the site');
if (!run('npm', ['run', 'build'], CUSTOMIZER_DIR))
  stop(
    'The customizer build failed. Fix it in the site, commit, and rerun this.',
  );
const changed = names(git(site, ['diff', '--name-only']));
const source = changed.filter((f) => !isGenerated(f));
if (source.length)
  stop(
    `The build changed files it shouldn't, so a generated file was likely resolved wrong:\n${source
      .map((f) => `  ${f}`)
      .join('\n')}\nNothing was committed. Check them in the site.`,
  );
if (changed.length) {
  git(site, ['add', '--', ...changed]);
  git(site, [
    'commit',
    '--quiet',
    '-m',
    `Regenerate pages, search index and CSS for ${targetDescribe}`,
  ]);
  console.log(`  ✔ committed ${changed.length} regenerated file(s)`);
} else console.log('  ✔ the build changed nothing');

// --- 5. package ---------------------------------------------------------------------------

step('Saving the patch and exporting the Reskin package');
if (!run('npm', ['run', 'save-patch'], CUSTOMIZER_DIR))
  stop('save-patch failed.');
if (!run('npm', ['run', 'export'], CUSTOMIZER_DIR)) stop('export failed.');
const failing = diffEntryChecks(t).filter((d) => d.exists && !d.applies);
for (const d of failing) {
  console.log(
    `  ✖ [${d.module}] ${d.description} doesn't apply to ${targetDescribe}`,
  );
  for (const err of d.errors) console.log(`      ${err}`);
}
if (failing.length)
  stop(
    "The new package still doesn't apply. Check the site against the target.",
  );
console.log(`  ✔ the Reskin package applies to ${targetDescribe}`);

// --- 6. push --------------------------------------------------------------------------------

const head = revParse(site, 'HEAD');
if (flag('no-push')) step('Push: skipped (--no-push)');
else if (originBefore === head) step('Push: origin already has this commit');
else {
  step(`Pushing ${branch} to origin`);
  const rewritten =
    !!originBefore &&
    siteGit(site, ['merge-base', '--is-ancestor', originBefore, 'HEAD'])
      .status !== 0;
  const args = rewritten
    ? ['push', `--force-with-lease=${branch}:${originBefore}`, 'origin', branch]
    : ['push', 'origin', branch];
  if (!run('git', ['-C', site, ...args], site))
    stop('The push failed. The site is updated locally.');
}

// --- 7. optional: refresh generated guide enums --------------------------------------------

const refreshEnums = flag('refresh-enums');
if (refreshEnums) {
  step(`Refreshing generated guide lists against 5etools-utils ${t.utilsRef}`);
  const { schemas } = loadSchemasAtRef(t.utilsRepo, t.utilsRef, t.schemaRel);
  const enumReport = runGuideEnums(schemas, t.guidesDir, { write: true });
  for (const line of enumReport.lines) console.log(`  ${line}`);
  if (enumReport.unknown > 0)
    stop('Unknown data-enum marker(s) found in guides.');
}

// --- 8. optional: headless page checks -----------------------------------------------------

const checkPages = flag('check-pages');
if (checkPages) {
  step('Checking touched pages in headless Chrome');
  const ok = await runPageCheck(site, upstreamChangedFiles);
  if (!ok) stop('One or more page checks failed.');
}

// --- summary ---------------------------------------------------------------------------------

const nextSteps: string[] = [];
if (!checkPages) {
  nextSteps.push(
    'Look over the changed pages: `npm run serve` in customizer/, then\n     `node shell/check.mjs --pages=<pages> --widths=1920,390` (or rerun with `--check-pages`).',
  );
}
nextSteps.push(
  'Fix what `npm run upstream:check` still reports (guides, anchors).',
);
nextSteps.push(
  'Stage customizer/upstream.patch and customizer/upstream.json here' +
    (refreshEnums ? ' (plus any updated guide enum lists).' : '.'),
);
nextSteps.push('In the app: Prepare, look over Review, and publish.');

console.log(
  `\n✔ The customizer site and Reskin package are on 5etools ${targetDescribe}.\n\nNext:\n` +
    nextSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'),
);
