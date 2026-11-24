/** Tests for scripts/lib/release.ts — the pure parts of `npm run release`. */
import { describe, it, expect } from 'vitest';
import {
  baseVersion,
  bridgeManifest,
  bridgeNote,
  bump,
  bundleResources,
  compareVersions,
  config,
  draftNotes,
  fill,
  finishNotes,
  formatCommits,
  parseCommits,
  parseNotes,
  pickEditor,
  portableNote,
  portableZipName,
  releaseBody,
  resolveVersion,
  setCargoVersion,
  setJsonVersion,
  versionProblem,
} from './release.ts';

describe('versions', () => {
  it('bump raises the chosen part and resets the ones below it', () => {
    expect(bump('v0.1.9', 'patch')).toBe('0.1.10');
    expect(bump('1.2.3', 'minor')).toBe('1.3.0');
    expect(bump('v1.2.3', 'major')).toBe('2.0.0');
    expect(() => bump('v1.2', 'patch')).toThrow();
    expect(() => bump('1.2.3', 'huge')).toThrow();
  });

  it('bump of a pre-release finishes it rather than skipping a version', () => {
    expect(bump('v1.2.3-beta.1', 'patch')).toBe('1.2.3');
    expect(bump('v1.2.3-beta.1', 'minor')).toBe('1.3.0');
  });

  it('compareVersions orders numerically and puts pre-releases first', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0-beta.2', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
  });

  it('baseVersion is the highest valid version given', () => {
    expect(baseVersion('v0.2.0', '1.0.0')).toBe('1.0.0');
    expect(baseVersion('v1.2.0', '1.0.0')).toBe('1.2.0');
    expect(baseVersion('', '1.0.0')).toBe('1.0.0');
    expect(baseVersion('', undefined)).toBeNull();
  });

  it('resolveVersion accepts names, menu numbers and exact versions', () => {
    for (const answer of ['patch', '1', ' Patch ']) {
      expect(resolveVersion(answer, '1.0.0')).toBe('1.0.1');
    }
    expect(resolveVersion('2', '1.0.0')).toBe('1.1.0');
    expect(resolveVersion('major', '1.0.0')).toBe('2.0.0');
    expect(resolveVersion('m', '1.0.0')).toBeNull();
    expect(resolveVersion('v2.0.0-rc.1', '1.0.0')).toBe('2.0.0-rc.1');
    expect(resolveVersion('4', '1.0.0')).toBeNull();
    expect(resolveVersion('patch', null)).toBeNull();
    expect(resolveVersion('1.0.0', null)).toBe('1.0.0');
  });

  it('versionProblem lets the never-released package.json version through', () => {
    const none = new Set<string>();
    expect(
      versionProblem('0.2.0', {
        latest: null,
        current: '0.2.0',
        released: none,
      }),
    ).toBeNull();
    expect(
      versionProblem('0.2.1', {
        latest: null,
        current: '0.2.0',
        released: none,
      }),
    ).toBeNull();
    expect(
      versionProblem('0.1.9', {
        latest: null,
        current: '0.2.0',
        released: none,
      }),
    ).toMatch(/lower than package\.json/);
  });

  it('versionProblem refuses anything not above the latest release', () => {
    const released = new Set(['0.3.0']);
    expect(
      versionProblem('0.3.0', { latest: '0.3.0', current: '0.3.0', released }),
    ).toMatch(/already exists/);
    expect(
      versionProblem('0.2.9', { latest: '0.3.0', current: '0.3.0', released }),
    ).toMatch(/isn't higher/);
    expect(
      versionProblem('0.3.1', { latest: '0.3.0', current: '0.3.0', released }),
    ).toBeNull();
  });

  it('fill substitutes tag and version', () => {
    expect(fill('build {tag} # {version}', '1.2.3')).toBe(
      'build v1.2.3 # 1.2.3',
    );
  });
});

describe('version files', () => {
  it('setJsonVersion changes only the first version', () => {
    const json =
      '{\n  "productName": "x",\n  "version": "0.2.0",\n  "plugins": { "version": "9.9.9" }\n}\n';
    expect(setJsonVersion(json, '0.3.0')).toBe(
      json.replace('"0.2.0"', '"0.3.0"'),
    );
    expect(() => setJsonVersion('{ "id": "x" }', '1.0.0')).toThrow();
  });

  it('setCargoVersion changes [package] version and keeps CRLF and dependencies', () => {
    const toml = [
      '[dependencies]',
      'serde = { version = "1.0" }',
      'version = "not this one"',
      '',
      '[package]',
      'name = "homebrew-manager"',
      'version = "0.2.0"',
      'edition = "2021"',
      '',
      '[build-dependencies]',
      'tauri-build = { version = "2" }',
      '',
    ].join('\r\n');
    expect(setCargoVersion(toml, '0.3.0')).toBe(
      toml.replace('version = "0.2.0"', 'version = "0.3.0"'),
    );
  });

  it('setCargoVersion handles [package] as the last section and refuses without one', () => {
    expect(
      setCargoVersion('[package]\nname = "x"\nversion = "1.0.0"\n', '1.1.0'),
    ).toBe('[package]\nname = "x"\nversion = "1.1.0"\n');
    expect(() =>
      setCargoVersion('[dependencies]\nversion = "1"\n', '1.1.0'),
    ).toThrow();
    expect(() =>
      setCargoVersion('[package]\nname = "x"\n[lib]\nversion = "1"\n', '1.1.0'),
    ).toThrow();
  });

  it('bridgeManifest points manifest at latest and download at this tag', () => {
    const json = JSON.stringify({
      id: 'foundry-homebrew-bridge',
      version: '1.4.0',
      manifest: 'old',
      download: 'old',
    });
    const out = JSON.parse(
      bridgeManifest(json, 'grapitygrape/5e-homebrew-manager', 'v0.3.0'),
    );
    expect(out).toEqual({
      id: 'foundry-homebrew-bridge',
      version: '1.4.0',
      manifest:
        'https://github.com/grapitygrape/5e-homebrew-manager/releases/latest/download/foundry-homebrew-bridge.json',
      download:
        'https://github.com/grapitygrape/5e-homebrew-manager/releases/download/v0.3.0/foundry-homebrew-bridge.zip',
    });
  });

  it('portableZipName is name, version, arch', () => {
    expect(portableZipName('0.3.0', 'x64')).toBe(
      '5e-Homebrew-Manager_0.3.0_x64-portable.zip',
    );
  });

  it('bundleResources pairs each source folder with its folder beside the exe', () => {
    const conf = {
      bundle: {
        resources: { '../guides/': 'guides/', '../deploy-modules/': 'deploy-modules' },
      },
    };
    expect(bundleResources(conf)).toEqual([
      ['../guides/', 'guides'],
      ['../deploy-modules/', 'deploy-modules'],
    ]);
    expect(() => bundleResources({ bundle: { resources: ['../guides/'] } })).toThrow();
    expect(() => bundleResources({})).toThrow();
  });
});

describe('release notes', () => {
  it('parseCommits splits log entries and ignores release commits', () => {
    const log =
      'Release v1.2.0\x1f\x1f\x1eFix issue #1\x1fDetails\x1fNote\x1eAnother fix\x1f\x1f';
    expect(parseCommits(log)).toEqual([
      { subject: 'Fix issue #1', body: 'Details', notes: 'Note' },
      { subject: 'Another fix', body: '', notes: '' },
    ]);
    expect(parseCommits('')).toEqual([]);
  });

  it('formatCommits makes bullets and indents bodies and notes', () => {
    const commits = [
      { subject: 'Fix token images', body: '', notes: '' },
      { subject: '- Already a bullet', body: 'Line 1\nLine 2', notes: '' },
      { subject: 'Note with git note', body: 'Body', notes: 'Extra note' },
    ];
    expect(formatCommits(commits)).toBe(
      '- Fix token images\n- Already a bullet\n  Line 1\n  Line 2\n- Note with git note\n  Body\n\n  Extra note',
    );
    expect(formatCommits([])).toBe('');
  });

  const LOG = '# v1.0.1\n\n- Fixed a thing\n\n# v1.0.0 — first\n\n- Hello\n';
  const released = new Set(['1.0.0', '1.0.1']);

  it('parseNotes finds version headings, including ones with trailing text', () => {
    const { preamble, sections } = parseNotes(`draft\r\n\r\n${LOG}`);
    expect(preamble).toBe('draft\n\n');
    expect(sections.map((s) => s.version)).toEqual(['1.0.1', '1.0.0']);
    expect(sections[1].heading).toBe('# v1.0.0 — first');
  });

  it('draftNotes moves text above the first heading under the new version', () => {
    expect(
      draftNotes(`## New\n- Faster census\n\n${LOG}`, '1.1.0', released),
    ).toBe(`# v1.1.0\n\n## New\n- Faster census\n\n${LOG}`);
  });

  it('draftNotes picks up an unreleased heading from a cancelled run', () => {
    const cancelled = `# v1.0.2\n\n- Drafted earlier\n\n${LOG}`;
    expect(draftNotes(cancelled, '1.1.0', released)).toBe(
      `# v1.1.0\n\n- Drafted earlier\n\n${LOG}`,
    );
    expect(draftNotes(cancelled, '1.0.2', released)).toBe(cancelled);
  });

  it('draftNotes fills in the commits, without repeating them', () => {
    expect(draftNotes(LOG, '1.1.0', released, '- Fix foo\n- Fix bar')).toBe(
      `# v1.1.0\n\n- Fix foo\n- Fix bar\n\n${LOG}`,
    );
    expect(
      draftNotes(
        `## Highlights\nAwesome\n\n${LOG}`,
        '1.1.0',
        released,
        '- Fix foo',
      ),
    ).toBe(`# v1.1.0\n\n## Highlights\nAwesome\n\n- Fix foo\n\n${LOG}`);
    expect(
      draftNotes(
        `## Highlights\n- Fix foo\n\n${LOG}`,
        '1.1.0',
        released,
        '- Fix foo',
      ),
    ).toBe(`# v1.1.0\n\n## Highlights\n- Fix foo\n\n${LOG}`);
  });

  it("draftNotes leaves a placeholder when there's no draft, and starts a new file", () => {
    expect(draftNotes(LOG, '1.1.0', released)).toMatch(
      /^# v1\.1\.0\n\n<!-- Notes for v1\.1\.0.*-->\n\n# v1\.0\.1\n/,
    );
    expect(draftNotes('', '1.0.0', new Set())).toMatch(
      /^# v1\.0\.0\n\n<!--.*-->\n$/,
    );
  });

  it("finishNotes returns the section's notes without comments and tidies the file", () => {
    const edited = `# v1.1.0\n\n<!-- placeholder -->\n- New thing\n\n${LOG}`;
    expect(finishNotes(edited, '1.1.0')).toEqual({
      notes: '- New thing',
      text: `# v1.1.0\n\n- New thing\n\n${LOG}`,
    });
    expect(finishNotes(`# v1.1.0\n\n<!-- x -->\n${LOG}`, '1.1.0')).toEqual({
      notes: '',
      text: `# v1.1.0\n\n${LOG}`,
    });
    expect(finishNotes(LOG, '1.1.0')).toBeNull();
  });

  it('releaseBody adds how to install the bridge below the notes', () => {
    const zipOnly = { version: '1.4.0', manifestUrl: null };
    expect(releaseBody('- New thing', zipOnly)).toBe(
      `- New thing\n\n${bridgeNote(zipOnly)}\n`,
    );
    expect(bridgeNote(zipOnly)).toMatch(
      /v1\.4\.0.*Unzip `foundry-homebrew-bridge\.zip`/,
    );
    const url =
      'https://github.com/o/r/releases/latest/download/foundry-homebrew-bridge.json';
    expect(releaseBody('', { version: '1.4.0', manifestUrl: url })).toBe(
      `**Foundry bridge module** v1.4.0. In Foundry, install it from the manifest URL: ${url}\n`,
    );
  });

  it('releaseBody puts the portable zip note between the notes and the bridge', () => {
    const bridge = { version: '1.4.0', manifestUrl: null };
    const zipName = '5e-Homebrew-Manager_0.3.0_x64-portable.zip';
    expect(releaseBody('- New thing', bridge, zipName)).toBe(
      `- New thing\n\n${portableNote(zipName)}\n\n${bridgeNote(bridge)}\n`,
    );
    expect(portableNote(zipName)).toContain(`\`${zipName}\``);
    expect(releaseBody('- New thing', bridge, null)).toBe(
      `- New thing\n\n${bridgeNote(bridge)}\n`,
    );
  });

  it('releaseBody strips comments', () => {
    expect(releaseBody('- New thing <!-- x -->')).toBe('- New thing\n');
    expect(releaseBody('')).toBe('');
  });
});

describe('config', () => {
  it('pickEditor takes the first usable editor and makes Zed and VS Code wait', () => {
    expect(pickEditor({ configured: 'zed' })).toBe('zed --wait');
    expect(pickEditor({ configured: 'zed -w' })).toBe('zed -w');
    expect(pickEditor({ env: { EDITOR: 'C:\\Zed\\bin\\Zed.exe' } })).toBe(
      'C:\\Zed\\bin\\Zed.exe --wait',
    );
    const spaced = '"C:\\Program Files\\Microsoft VS Code\\bin\\code.cmd"';
    expect(pickEditor({ env: { EDITOR: spaced } })).toBe(`${spaced} --wait`);
    expect(pickEditor({ env: { VISUAL: 'code', EDITOR: 'vim' } })).toBe(
      'code --wait',
    );
    expect(
      pickEditor({ env: { EDITOR: 'vim' }, gitEditor: 'zed --wait' }),
    ).toBe('vim');
    expect(pickEditor({ gitEditor: 'true', installed: ['zed'] })).toBe(
      'zed --wait',
    );
    expect(pickEditor({ env: { EDITOR: '  ' } })).toBeNull();
  });

  it('pickEditor prefers an installed IDE over notepad', () => {
    expect(pickEditor({ env: { LAUNCH_EDITOR: 'zed' } })).toBe('zed --wait');
    expect(
      pickEditor({ env: { EDITOR: 'notepad.exe' }, installed: ['code'] }),
    ).toBe('code --wait');
    expect(pickEditor({ env: { EDITOR: 'notepad' }, installed: [] })).toBe(
      'notepad',
    );
  });

  it('config defaults to verify and tauri:build, and overrides win', () => {
    expect(config({ pkg: { scripts: { verify: 'x' } } })).toEqual({
      branch: 'main',
      verify: 'npm run verify',
      build: 'npm run tauri:build',
      editor: null,
      notes: 'release-notes.md',
    });
    expect(
      config({ pkg: null, overrides: { branch: 'release' } }),
    ).toMatchObject({
      branch: 'release',
      verify: null,
    });
  });
});
