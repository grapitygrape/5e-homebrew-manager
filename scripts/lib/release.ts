/**
 * scripts/lib/release.ts — the pure parts of `npm run release`
 * (scripts/release.ts). Ported from the Foundry module release tools
 * (foundry-vtt-module-release/tools/release.mjs) so the version prompt and the
 * release-notes.md flow behave the same in both. Tested in release.test.ts.
 */

export const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export const PARTS = ['patch', 'minor', 'major'] as const;
export type Part = (typeof PARTS)[number];

function parse(version: string) {
  const match = SEMVER.exec(String(version ?? '').trim());
  if (!match) throw new Error(`"${version}" isn't a version like 1.2.3.`);
  return { nums: match.slice(1, 4).map(Number), pre: match[4] ?? '' };
}

/** Bumps a version or tag by part. A pre-release drops its suffix. */
export function bump(from: string, part: string): string {
  const {
    nums: [major, minor, patch],
    pre,
  } = parse(from);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${pre ? patch : patch + 1}`;
  throw new Error(`"${part}" isn't patch, minor or major.`);
}

/** Negative, zero or positive, like a sort comparator. A pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  const diff =
    pa.nums[0] - pb.nums[0] ||
    pa.nums[1] - pb.nums[1] ||
    pa.nums[2] - pb.nums[2];
  if (diff || pa.pre === pb.pre) return diff;
  if (!pa.pre || !pb.pre) return pa.pre ? -1 : 1;
  return pa.pre.localeCompare(pb.pre, 'en', { numeric: true });
}

/** The highest valid version given, without its "v", or null. */
export function baseVersion(
  ...versions: (string | null | undefined)[]
): string | null {
  return (
    versions
      .map((v) =>
        String(v ?? '')
          .trim()
          .replace(/^v/, ''),
      )
      .filter((v) => SEMVER.test(v))
      .sort(compareVersions)
      .pop() ?? null
  );
}

/**
 * Turns an answer into a version: a part name, its number in the menu
 * (1 patch, 2 minor, 3 major), or an exact version. Null if it's none of those.
 */
export function resolveVersion(
  answer: string | null | undefined,
  base: string | null,
): string | null {
  const raw = String(answer ?? '').trim();
  const low = raw.toLowerCase();
  const part = PARTS.find((p, i) => low === p || low === String(i + 1));
  if (part) return base ? bump(base, part) : null;
  return SEMVER.test(raw) ? raw.replace(/^v/i, '') : null;
}

/**
 * Why a version can't be released, or null if it can. It must beat the
 * latest release, so "latest" on GitHub stays the newest build. It may
 * equal package.json's version when that one was never released (0.2.0 here
 * before the first release).
 */
export function versionProblem(
  version: string,
  {
    latest,
    current,
    released,
  }: { latest: string | null; current: string | null; released: Set<string> },
): string | null {
  const tag = `v${version}`;
  if (released.has(version)) return `${tag} already exists on GitHub.`;
  if (latest && compareVersions(version, latest) <= 0) {
    return `${tag} isn't higher than the latest release (${latest}), so it would not be the newest build.`;
  }
  if (current && compareVersions(version, current) < 0) {
    return `${tag} is lower than package.json's ${current}.`;
  }
  return null;
}

/** Fills {tag} and {version} in a configured command. */
export function fill(command: string, version: string): string {
  return command
    .replaceAll('{tag}', `v${version}`)
    .replaceAll('{version}', version);
}

/** Sets the first "version" in a JSON file's text, leaving the rest of its formatting alone. */
export function setJsonVersion(json: string, version: string): string {
  const pattern = /("version"\s*:\s*")[^"]*(")/;
  if (!pattern.test(json)) throw new Error('No "version" field to set.');
  return json.replace(pattern, `$1${version}$2`);
}

/** Sets [package] version in Cargo.toml's text. Dependency versions are left alone. */
export function setCargoVersion(toml: string, version: string): string {
  const section =
    /^\[package\][^\S\r\n]*\r?\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml);
  if (!section) throw new Error('Cargo.toml has no [package] section.');
  const body = section[1];
  const pattern = /^(version\s*=\s*")[^"]*(")/m;
  if (!pattern.test(body))
    throw new Error('Cargo.toml [package] has no version.');
  const start = section.index + section[0].length - body.length;
  return (
    toml.slice(0, start) +
    body.replace(pattern, `$1${version}$2`) +
    toml.slice(start + body.length)
  );
}

/* -- portable zip -- */

/** Marks a portable copy, so the app keeps its data in data/ beside the exe (config.rs). */
export const PORTABLE_MARKER = 'portable';

/** The portable zip's file name: `<name>_<version>_<arch>-portable.zip`. */
export function portableZipName(version: string, arch: string): string {
  return `5e-Homebrew-Manager_${version}_${arch}-portable.zip`;
}

/** How to use the portable zip, for the release notes. */
export function portableNote(zipName: string): string {
  return `**Portable (Windows)**: no install needed. Unzip \`${zipName}\` anywhere and run \`homebrew-manager.exe\`. It keeps its own settings in a \`data\` folder beside it. See the README in the zip.`;
}

/**
 * tauri.conf.json's bundle.resources as [source folder, folder beside the
 * exe] pairs. Sources are relative to src-tauri/. The app looks for these
 * beside its exe, so the portable zip puts them there.
 */
export function bundleResources(conf: {
  bundle?: { resources?: unknown };
}): [string, string][] {
  const resources = conf.bundle?.resources;
  if (!resources || typeof resources !== 'object' || Array.isArray(resources))
    throw new Error(
      'tauri.conf.json bundle.resources should map source folders to target folders.',
    );
  return Object.entries(resources as Record<string, unknown>).map(
    ([from, to]) => [from, String(to).replace(/[\\/]+$/, '')],
  );
}

/* -- release notes -- */

export type Commit = { subject: string; body: string; notes: string };

const HEADING = /^# v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?=\s|$).*$/gm;
const COMMENTS = /<!--[\s\S]*?-->/g;

const placeholder = (version: string) =>
  `<!-- Notes for v${version}: write or paste markdown, save, then close this tab. Comments are removed. -->`;

/** Parses `git log --format=%s%x1f%b%x1f%N%x1e` into commits, dropping release commits. */
export function parseCommits(logOutput: string): Commit[] {
  if (!logOutput) return [];
  return logOutput
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [subject = '', body = '', notes = ''] = entry
        .split('\x1f')
        .map((s) => s.trim());
      return { subject, body, notes };
    })
    .filter(
      ({ subject }) => subject && !/^Release v?\d+\.\d+\.\d+/i.test(subject),
    );
}

/** Commits as markdown bullets, with bodies and git notes indented under them. */
export function formatCommits(commits: Commit[]): string {
  if (!commits?.length) return '';
  return commits
    .map(({ subject, body, notes }) => {
      let title = subject.trim();
      if (!/^[-*]\s/.test(title)) title = `- ${title}`;
      const extra = [body, notes]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join('\n\n');
      if (!extra) return title;
      const indented = extra
        .split('\n')
        .map((line) => (line.trim() ? `  ${line}` : ''))
        .join('\n');
      return `${title}\n${indented}`;
    })
    .join('\n');
}

type Section = { version: string; heading: string; body: string };

/** Splits release-notes.md into what's above the first version heading and the sections. */
export function parseNotes(text: string): {
  preamble: string;
  sections: Section[];
} {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const matches = [...src.matchAll(HEADING)];
  const preamble = src.slice(0, matches[0]?.index ?? src.length);
  const sections = matches.map((m, i) => ({
    version: m[1],
    heading: m[0],
    body: src.slice(m.index + m[0].length, matches[i + 1]?.index ?? src.length),
  }));
  return { preamble, sections };
}

/**
 * Moves the draft under a "# v{version}" heading at the top. The draft is the
 * text above the first heading plus any leading sections whose version was
 * never released (a cancelled run, or a version you changed your mind about).
 * The commits since the last release are added unless the draft has them.
 * @param released  Versions that have a tag, without the "v".
 */
export function draftNotes(
  text: string,
  version: string,
  released: Set<string>,
  commitsText = '',
): string {
  const { preamble, sections } = parseNotes(text);
  const firstReleased = sections.findIndex((s) => released.has(s.version));
  const cut = firstReleased === -1 ? sections.length : firstReleased;
  const draft = [preamble, ...sections.slice(0, cut).map((s) => s.body)]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
  const combined = draft
    ? commitsText && !draft.includes(commitsText)
      ? `${draft}\n\n${commitsText}`
      : draft
    : commitsText || placeholder(version);
  const rest = sections
    .slice(cut)
    .map((s) => s.heading + s.body)
    .join('')
    .trim();
  return `# v${version}\n\n${combined}\n${rest ? `\n${rest}\n` : ''}`;
}

/**
 * Cleans the new version's section (comments removed) and returns its notes
 * with the file text to save. Null if the heading is gone.
 */
export function finishNotes(
  text: string,
  version: string,
): { notes: string; text: string } | null {
  const { preamble, sections } = parseNotes(text);
  const section = sections.find((s) => s.version === version);
  if (!section) return null;
  const notes = section.body.replace(COMMENTS, '').trim();
  section.body = notes ? `\n\n${notes}\n\n` : '\n\n';
  const out = preamble + sections.map((s) => s.heading + s.body).join('');
  return { notes, text: `${out.trimEnd()}\n` };
}

/** The notes to publish, comments removed. */
export function releaseBody(
  notes: string,
  bridge?: BridgeInfo,
  portableZip?: string | null,
): string {
  const clean = String(notes ?? '')
    .replace(COMMENTS, '')
    .trim();
  const parts = [
    clean,
    portableZip && portableNote(portableZip),
    bridge && bridgeNote(bridge),
  ].filter(Boolean);
  return parts.length ? `${parts.join('\n\n')}\n` : '';
}

/* -- Foundry bridge module -- */

export const BRIDGE_ZIP = 'foundry-homebrew-bridge.zip';
export const BRIDGE_JSON = 'foundry-homebrew-bridge.json';

/** The bridge's version, and its manifest URL when the repo is public. */
export type BridgeInfo = { version: string; manifestUrl: string | null };

/** How to install the bridge from this release. */
export function bridgeNote({ version, manifestUrl }: BridgeInfo): string {
  return manifestUrl
    ? `**Foundry bridge module** v${version}. In Foundry, install it from the manifest URL: ${manifestUrl}`
    : `**Foundry bridge module** v${version}. Unzip \`${BRIDGE_ZIP}\` into Foundry's \`Data/modules\` folder.`;
}

/** Release URLs for the bridge on a public repo: manifest follows the latest release, download pins this one. */
export function bridgeUrls(repo: string, tag: string) {
  const base = `https://github.com/${repo}/releases`;
  return {
    manifest: `${base}/latest/download/${BRIDGE_JSON}`,
    download: `${base}/download/${tag}/${BRIDGE_ZIP}`,
  };
}

/** The bridge's module.json with manifest and download pointed at this repo's releases. */
export function bridgeManifest(json: string, repo: string, tag: string) {
  const manifest = JSON.parse(json);
  const urls = bridgeUrls(repo, tag);
  return `${JSON.stringify({ ...manifest, ...urls }, null, 2)}\n`;
}

/* -- config -- */

const programOf = (command: string) => {
  const cmd = command.trim();
  // The quoted path, or the first word; split on either slash so a Windows
  // path reads the same on any OS.
  const first = cmd.startsWith('"')
    ? cmd.slice(1, cmd.indexOf('"', 1))
    : cmd.split(/\s+/)[0];
  return (first.split(/[\\/]/).pop() ?? '')
    .toLowerCase()
    .replace(/\.(exe|cmd)$/, '');
};

/**
 * The editor command for release notes, or null to ask in the terminal.
 * Zed and VS Code return straight away, so they get --wait added.
 */
export function pickEditor({
  configured,
  env = {},
  gitEditor,
  installed = [],
}: {
  configured?: string | null;
  env?: Record<string, string | undefined>;
  gitEditor?: string;
  installed?: string[];
}): string | null {
  // "true" and ":" are how git and some tools say "no editor".
  const usable = (cmd: string | null | undefined): cmd is string =>
    Boolean(cmd?.trim()) && !['true', ':'].includes(cmd!.trim());
  const explicit = [configured, env.RELEASE_EDITOR, env.LAUNCH_EDITOR].find(
    usable,
  );
  const generic = [env.VISUAL, env.EDITOR, gitEditor].find(usable);
  const ide = installed[0];
  const found =
    explicit ??
    (generic && programOf(generic) !== 'notepad' ? generic : (ide ?? generic));
  if (!found) return null;
  const command = found.trim();
  const waits = /(^|\s)(-w|--wait)(\s|$)/.test(command);
  return ['zed', 'code'].includes(programOf(command)) && !waits
    ? `${command} --wait`
    : command;
}

export type ReleaseConfig = {
  branch: string;
  verify: string | null;
  build: string;
  editor: string | null;
  notes: string;
};

/** Defaults from package.json, with release.config.json on top. */
export function config({
  pkg,
  overrides = {},
}: {
  pkg: { scripts?: Record<string, string> } | null;
  overrides?: Partial<ReleaseConfig>;
}): ReleaseConfig {
  const scripts = pkg?.scripts ?? {};
  return {
    branch: 'main',
    verify: scripts.verify ? 'npm run verify' : null,
    build: 'npm run tauri:build',
    editor: null,
    notes: 'release-notes.md',
    ...overrides,
  };
}
