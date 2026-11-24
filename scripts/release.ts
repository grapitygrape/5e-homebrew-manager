/**
 * scripts/release.ts — builds the portable desktop zip and publishes it as a
 * GitHub release. There are no installers (bundle.active is off).
 *
 *   npm run release                  asks patch / minor / major
 *   npm run release -- minor         skips the question
 *   npm run release -- 1.2.0         exact version
 *   npm run release -- --dry-run     checks, notes and build only; no commit, no release
 *   npm run release -- --no-edit     use the notes as they are, don't open the editor
 *   npm run release -- --yes         don't ask before committing and publishing
 *
 * WHY IT BUILDS LOCALLY
 *   The Foundry modules publish first and let a workflow build the zip. Here
 *   `npm run verify` needs the sibling mimic-ui checkout, the repo is private
 *   (Windows runner minutes cost double), and a cold Rust build takes a long
 *   time. Building here reuses src-tauri/target and uploads exactly the
 *   exe that was just built and checked.
 *
 * PORTABLE ZIP
 *   5e-Homebrew-Manager_<version>_<arch>-portable.zip holds the release exe,
 *   the bundle.resources folders beside it, an empty `portable` file, a
 *   README (src-tauri/portable/) and the data folder's READMEs. The
 *   `portable` file tells the app to keep its config and browser data in a
 *   data/ folder beside the exe (config.rs). Releases run on Windows only.
 *
 * RELEASE NOTES
 *   Same as the Foundry release tools. release-notes.md holds one "# vX.Y.Z"
 *   heading per release, newest first. Anything above the newest released
 *   heading is the draft. At release the draft, plus the commits since the
 *   last release, moves under the new heading and opens in your editor. What's
 *   under it when you close the tab goes above GitHub's generated change list.
 *
 * WHAT IT CHANGES
 *   Sets the version in package.json + package-lock.json (`npm version`),
 *   src-tauri/tauri.conf.json and src-tauri/Cargo.toml (Cargo.lock follows
 *   when cargo builds), runs `npm run tauri:build`, then commits those files
 *   and release-notes.md as "Release vX.Y.Z", pushes, and creates the release
 *   at that commit with the portable zip attached. If the build fails, or on
 *   --dry-run, the version files are put back.
 *
 * FOUNDRY BRIDGE
 *   The release also carries foundry-homebrew-bridge.zip (the module's tracked
 *   files, staged in dist/). Foundry can only install from a manifest URL it
 *   can fetch without signing in, so when this repo is public the release also
 *   gets foundry-homebrew-bridge.json, and the module.json in the zip points its
 *   manifest and download at this repo's releases. While the repo is private,
 *   the zip keeps module.json as committed and the notes say to unzip it into
 *   Data/modules.
 *
 * On Windows the build runs with ~/.cargo/bin on PATH, and inside vcvars64
 * (found with vswhere) when cl.exe isn't already on PATH.
 *
 * Optional release.config.json at the repo root overrides any of:
 *   { "branch": "main", "verify": "npm run verify",
 *     "build": "npm run tauri:build", "editor": "zed --wait",
 *     "notes": "release-notes.md" }
 * Commands may use {tag} (v1.2.3) and {version} (1.2.3). The editor is that
 * file's, then RELEASE_EDITOR, VISUAL, EDITOR, git's core.editor, then Zed or
 * VS Code if installed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  BRIDGE_JSON,
  BRIDGE_ZIP,
  PARTS,
  baseVersion,
  bridgeManifest,
  bridgeUrls,
  bump,
  config,
  draftNotes,
  fill,
  finishNotes,
  formatCommits,
  parseCommits,
  bundleResources,
  pickEditor,
  portableZipName,
  PORTABLE_MARKER,
  releaseBody,
  resolveVersion,
  setCargoVersion,
  setJsonVersion,
  versionProblem,
  type BridgeInfo,
  type ReleaseConfig,
} from './lib/release.ts';
import { zip } from './lib/zip.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const at = (file: string) => path.join(ROOT, file);

const RELEASE_DIR = at('src-tauri/target/release');
const BRIDGE_DIR = 'foundry-homebrew-bridge';
const DIST_DIR = at('dist');
const VERSION_FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/tauri.conf.json',
  'src-tauri/Cargo.toml',
  'crates/hm-core/Cargo.toml',
  'crates/hm-backend/Cargo.toml',
  'Cargo.lock',
];

const read = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' }).trim();
const tryRead = (cmd: string, args: string[]) => {
  try {
    return read(cmd, args);
  } catch {
    return '';
  }
};
const readJson = (file: string) =>
  fs.existsSync(at(file))
    ? JSON.parse(fs.readFileSync(at(file), 'utf8'))
    : null;

// shell: true so npm (npm.cmd on Windows) resolves. Versions are validated before use.
const run = (command: string, env: NodeJS.ProcessEnv = process.env) =>
  spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true, env })
    .status === 0;
const quiet = (command: string) =>
  spawnSync(command, { cwd: ROOT, stdio: 'ignore', shell: true }).status === 0;
const git = (...args: string[]) =>
  spawnSync('git', args, { cwd: ROOT, stdio: 'inherit' }).status === 0;
const gh = (...args: string[]) =>
  spawnSync('gh', args, { cwd: ROOT, stdio: 'inherit' }).status === 0;

// git may check text files out with CRLF on Windows; keep whichever the file has.
const readText = (file: string) =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
function writeText(file: string, text: string, like: string) {
  fs.writeFileSync(
    file,
    /\r\n/.test(like) ? text.replace(/\r?\n/g, '\r\n') : text,
  );
}

// Put back whatever a failed or dry-run build changed. Set while the version
// files are bumped, so Ctrl+C during the build restores them too.
let restore: (() => void) | null = null;

function fail(message: string): never {
  restore?.();
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
}

process.on('SIGINT', () => fail('\nStopped. Version files put back.'));

async function ask(question: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** Commits since `tag` (or the whole history without one), oldest first. */
function commitsSince(tag: string) {
  const range = tag ? [`${tag}..HEAD`] : ['HEAD'];
  const out = tryRead('git', [
    'log',
    ...range,
    '--no-merges',
    '--reverse',
    '--format=%s%x1f%b%x1f%N%x1e',
  ]);
  return parseCommits(out);
}

/** Puts the draft under the new heading, opens it, and returns the cleaned notes. */
async function editNotes(
  cfg: ReleaseConfig,
  version: string,
  released: Set<string>,
  commitsText: string,
  noEdit: boolean,
) {
  const file = at(cfg.notes);
  const original = readText(file);
  writeText(
    file,
    draftNotes(original, version, released, commitsText),
    original,
  );
  if (!noEdit) {
    const gitEditor = tryRead('git', ['config', 'core.editor']);
    const editor =
      pickEditor({ configured: cfg.editor, env: process.env, gitEditor }) ??
      pickEditor({
        installed: ['zed', 'code'].filter((cmd) => quiet(`${cmd} --version`)),
      });
    if (editor) {
      console.log(
        `\nOpening ${cfg.notes} with ${editor}. Write under "# v${version}", save, and close the tab.`,
      );
      if (!run(`${editor} "${file}"`)) {
        fail('The editor exited with an error. Nothing released.');
      }
    } else {
      await ask(
        `\nEdit the "# v${version}" section of ${cfg.notes}, save it, then press Enter.`,
      );
    }
  }
  const edited = readText(file);
  const finished = finishNotes(edited, version);
  if (!finished) {
    fail(
      `${cfg.notes} has no "# v${version}" heading any more. Nothing released.`,
    );
  }
  writeText(file, finished.text, edited);
  return finished.notes;
}

/** The build's environment and command: cargo on PATH, MSVC loaded on Windows. */
function buildCommand(command: string): {
  command: string;
  env: NodeJS.ProcessEnv;
} {
  if (process.platform !== 'win32') return { command, env: process.env };
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
  const env = { ...process.env, PATH: `${cargoBin};${process.env.PATH ?? ''}` };
  if (spawnSync('where', ['cl'], { stdio: 'ignore', env }).status === 0) {
    return { command, env };
  }
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio\\Installer\\vswhere.exe',
  );
  const vcvars = fs.existsSync(vswhere)
    ? tryRead(vswhere, [
        '-latest',
        '-products',
        '*',
        '-find',
        'VC\\Auxiliary\\Build\\vcvars64.bat',
      ]).split(/\r?\n/)[0]
    : '';
  if (!vcvars) {
    console.warn(
      "cl.exe isn't on PATH and vcvars64.bat wasn't found; building without MSVC loaded.",
    );
    return { command, env };
  }
  return { command: `call "${vcvars}" >nul && ${command}`, env };
}

/**
 * Zips the bridge's tracked files into dist/, plus its manifest when the repo
 * is public. Returns the files to attach and what the notes should say.
 */
function packageBridge(
  tag: string,
  repo: string | null,
): { files: string[]; info: BridgeInfo } {
  const tracked = read('git', ['ls-files', '--', BRIDGE_DIR])
    .split('\n')
    .filter(Boolean);
  const manifestPath = `${BRIDGE_DIR}/module.json`;
  if (!tracked.includes(manifestPath)) fail(`No ${manifestPath} in git.`);
  const committed = readText(at(manifestPath));
  const manifest = repo ? bridgeManifest(committed, repo, tag) : committed;

  const entries = tracked.map((file) => ({
    name: path.posix.relative(BRIDGE_DIR, file),
    data:
      file === manifestPath
        ? Buffer.from(manifest, 'utf8')
        : fs.readFileSync(at(file)),
  }));
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const files = [path.join(DIST_DIR, BRIDGE_ZIP)];
  fs.writeFileSync(files[0], zip(entries));
  if (repo) {
    files.push(path.join(DIST_DIR, BRIDGE_JSON));
    fs.writeFileSync(files[1], manifest);
  }
  const version = String(JSON.parse(committed).version ?? '');
  const manifestUrl = repo ? bridgeUrls(repo, tag).manifest : null;
  return { files, info: { version, manifestUrl } };
}

/** Files under `dir`, as paths relative to it. */
function filesUnder(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((rel) => fs.statSync(path.join(dir, rel)).isFile());
}

/**
 * Zips the release exe and its resource folders into dist/, under one top
 * folder so unzipping doesn't scatter them.
 */
function packagePortable(version: string): string {
  const name = /^name\s*=\s*"([^"]+)"/m.exec(
    readText(at('src-tauri/Cargo.toml')),
  )?.[1];
  if (!name) fail('src-tauri/Cargo.toml has no package name.');
  const exe = path.join(RELEASE_DIR, `${name}.exe`);
  if (!fs.existsSync(exe))
    fail(`The build made no ${path.relative(ROOT, exe)}.`);

  const top = '5e Homebrew Manager';
  const entries = [
    { name: `${top}/${name}.exe`, data: fs.readFileSync(exe) },
    { name: `${top}/${PORTABLE_MARKER}`, data: Buffer.alloc(0) },
    {
      name: `${top}/README.md`,
      data: fs.readFileSync(at('src-tauri/portable/README.md')),
    },
  ];
  // The data folder's READMEs and .env.example, so they're there before the
  // first run. The app writes the same files on every start (data_folder.rs).
  const dataDocs = at('src-tauri/data-folder');
  for (const rel of filesUnder(dataDocs)) {
    entries.push({
      name: `${top}/data/${rel.replaceAll('\\', '/')}`,
      data: fs.readFileSync(path.join(dataDocs, rel)),
    });
  }
  // From the sources, not target/release, which can keep files since deleted.
  const conf = readJson('src-tauri/tauri.conf.json') ?? {};
  for (const [from, to] of bundleResources(conf)) {
    const src = path.resolve(at('src-tauri'), from);
    if (!fs.existsSync(src)) fail(`Bundle resource ${from} doesn't exist.`);
    for (const rel of filesUnder(src)) {
      entries.push({
        name: `${top}/${to}/${rel.replaceAll('\\', '/')}`,
        data: fs.readFileSync(path.join(src, rel)),
      });
    }
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  const file = path.join(DIST_DIR, portableZipName(version, process.arch));
  fs.writeFileSync(file, zip(entries));
  return file;
}

async function main(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const yes = argv.includes('--yes');
  const noEdit = argv.includes('--no-edit');
  const choice = argv.find((a) => !a.startsWith('--'));

  const pkg =
    readJson('package.json') ?? fail('No package.json at the repo root.');
  const cfg = config({ pkg, overrides: readJson('release.config.json') ?? {} });

  // Release exactly what's on GitHub, so the tag matches what was built. The
  // notes file may have uncommitted drafting; it's committed with the release.
  // The portable zip is the only desktop download, and it wraps the Windows exe.
  if (process.platform !== 'win32')
    fail(
      'Releases are built on Windows: the portable zip holds the Windows exe.',
    );
  if (!quiet('gh auth status'))
    fail("GitHub CLI isn't signed in. Run: gh auth login");
  if (read('git', ['branch', '--show-current']) !== cfg.branch) {
    fail(`Switch to ${cfg.branch} first.`);
  }
  const dirty = read('git', ['diff', '--name-only', 'HEAD'])
    .split('\n')
    .filter((file) => file && file !== cfg.notes);
  if (dirty.length)
    fail(`Commit or discard these first:\n  ${dirty.join('\n  ')}`);
  read('git', ['fetch', '--quiet', '--tags', 'origin', cfg.branch]);
  if (
    read('git', ['rev-parse', 'HEAD']) !==
    read('git', ['rev-parse', `origin/${cfg.branch}`])
  ) {
    fail(
      `Local ${cfg.branch} and origin/${cfg.branch} differ. Push or pull first.`,
    );
  }

  const released = new Set(
    tryRead('git', ['ls-remote', '--tags', 'origin'])
      .split('\n')
      .map((line) => /refs\/tags\/v([^^]+)$/.exec(line)?.[1])
      .filter((v): v is string => Boolean(v)),
  );
  const latestTag = tryRead('gh', [
    'release',
    'view',
    '--json',
    'tagName',
    '--jq',
    '.tagName',
  ]);
  const latest = baseVersion(latestTag);
  const current = baseVersion(pkg.version);
  const base = baseVersion(latest, current);

  let version = choice ? resolveVersion(choice, base) : null;
  if (choice && !version) {
    fail(`"${choice}" isn't patch, minor, major or a version like 1.2.3.`);
  }
  if (!version) {
    console.log(
      `\n${pkg.name}: latest release ${latestTag || 'none'}, package.json ${pkg.version ?? 'none'}`,
    );
    if (base)
      PARTS.forEach((p, i) =>
        console.log(`  ${i + 1}) ${p.padEnd(5)}  v${bump(base, p)}`),
      );
    const prompt = base
      ? 'Choose 1-3, or type a version: '
      : 'First release version (like 1.0.0): ';
    while (!version) {
      const answer = await ask(prompt);
      if (!answer) {
        console.log('Cancelled.');
        return;
      }
      version = resolveVersion(answer, base);
      if (!version) console.log('Not a choice or a version like 1.2.3.');
    }
  }
  const tag = `v${version}`;
  const problem = versionProblem(version, { latest, current, released });
  if (problem) fail(problem);

  if (cfg.verify) {
    const verify = fill(cfg.verify, version);
    console.log(`\n> ${verify}`);
    if (!run(verify)) fail('Checks failed. Nothing released.');
  } else console.warn('No verify command found; skipping checks.');

  // Before the first release there's no release tag; start from the newest tag.
  const since =
    latestTag || tryRead('git', ['describe', '--tags', '--abbrev=0']);
  const commitsText = formatCommits(commitsSince(since));
  const notes = await editNotes(cfg, version, released, commitsText, noEdit);
  console.log(
    notes
      ? `\nNotes for ${tag}:\n${notes.replace(/^/gm, '  | ')}`
      : `\nNo notes for ${tag}; just the generated ones.`,
  );

  if (!dryRun && !yes) {
    const question = `\nBuild ${tag}, commit "Release ${tag}", push to ${cfg.branch} and publish? [y/N] `;
    if ((await ask(question)).toLowerCase() !== 'y') {
      console.log(`Cancelled. Your notes are saved in ${cfg.notes}.`);
      return;
    }
  }

  // Bump every version file, keeping the originals to put back.
  const saved = VERSION_FILES.map(
    (file) => [at(file), readText(at(file))] as const,
  );
  restore = () => {
    for (const [file, text] of saved) if (text) fs.writeFileSync(file, text);
    restore = null;
  };
  if (
    !run(`npm version ${version} --no-git-tag-version --allow-same-version`)
  ) {
    fail('npm version failed. Nothing released.');
  }
  for (const [file, setVersion] of [
    ['src-tauri/tauri.conf.json', setJsonVersion],
    ['src-tauri/Cargo.toml', setCargoVersion],
    ['crates/hm-core/Cargo.toml', setCargoVersion],
    ['crates/hm-backend/Cargo.toml', setCargoVersion],
  ] as const) {
    const text = readText(at(file));
    writeText(at(file), setVersion(text, version), text);
  }

  // Ensure customizer/patch-deploy/ exists before Tauri bundles resources.
  if (!fs.existsSync(at('customizer/patch-deploy/manifest.json'))) {
    console.log('\n> node customizer/shell/export.mjs --from-patch --no-licensed-fonts');
    if (!run('node customizer/shell/export.mjs --from-patch --no-licensed-fonts')) {
      fail('Failed to export customizer/patch-deploy.');
    }
  }

  // A public repo's release URLs are reachable by Foundry; a private one's aren't.
  const repoInfo = tryRead('gh', [
    'repo',
    'view',
    '--json',
    'nameWithOwner,visibility',
    '--jq',
    '.nameWithOwner + " " + .visibility',
  ]).split(' ');
  const publicRepo = repoInfo[1] === 'PUBLIC' ? repoInfo[0] : null;
  const bridge = packageBridge(tag, publicRepo);
  const bridgeKind = publicRepo
    ? 'public repo: zip + manifest'
    : 'private repo: zip only';
  console.log(
    `\nFoundry bridge v${bridge.info.version} (${bridgeKind}):\n` +
      bridge.files.map((f) => `  ${path.relative(ROOT, f)}`).join('\n'),
  );

  const build = buildCommand(fill(cfg.build, version));
  console.log(`\n> ${fill(cfg.build, version)}`);
  if (!run(build.command, build.env))
    fail('Build failed. Version files put back; nothing released.');
  const portable = packagePortable(version);
  const assets = [portable];
  console.log(
    `\nRelease files:\n${assets.map((a) => `  ${path.relative(ROOT, a)}`).join('\n')}`,
  );

  if (dryRun) {
    restore();
    console.log(
      `\nDry run: version files put back. Would commit "Release ${tag}", push and publish.`,
    );
    console.log(
      `${cfg.notes} keeps the "# ${tag}" section; the next run picks it up again.`,
    );
    return;
  }

  restore = null; // From here the bumped files are meant to stay.
  const changed = [...VERSION_FILES, cfg.notes].filter((file) =>
    fs.existsSync(at(file)),
  );
  if (!git('add', '--', ...changed) || !git('commit', '-m', `Release ${tag}`)) {
    fail(
      'Commit failed. The version files and notes are changed but not committed; nothing released.',
    );
  }
  if (!git('push', 'origin', `HEAD:${cfg.branch}`)) {
    fail(
      `Push failed. "Release ${tag}" is committed locally; push it, then publish with:\n` +
        `  gh release create ${tag} --target ${cfg.branch} --title ${tag} --generate-notes <portable zip>${bridge.files.map((f) => `"${path.relative(ROOT, f)}"`).join(' ')}`,
    );
  }
  const sha = read('git', ['rev-parse', 'HEAD']);

  // Creates the tag on GitHub at the release commit. gh puts --notes above the
  // generated notes.
  if (
    !gh(
      'release',
      'create',
      tag,
      ...assets,
      ...bridge.files,
      '--target',
      sha,
      '--title',
      tag,
      '--generate-notes',
      '--notes',
      releaseBody(notes, bridge.info, path.basename(portable)),
    )
  ) {
    fail(
      `gh release create failed. "Release ${tag}" is pushed; publish it from GitHub's Releases page.`,
    );
  }

  const url = tryRead('gh', [
    'release',
    'view',
    tag,
    '--json',
    'url',
    '--jq',
    '.url',
  ]);
  console.log(`\nReleased ${tag}.${url ? `\n  ${url}` : ''}`);
}

main(process.argv.slice(2)).catch((error) => fail(error.message));
