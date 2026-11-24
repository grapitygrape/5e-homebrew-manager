/** Tests for the collision checker and the submission linter. */
import { describe, it, expect } from 'vitest';
import {
  findCollisions,
  buildOfficialKeys,
  lintSubmission,
  readSiteSources,
} from '../audit/index.ts';
import type { SiteSources } from '../audit/index.ts';

const site: SiteSources = readSiteSources({
  'sources-5etools.json': {
    $defs: {
      sources: { enum: ['PHB', 'XPHB', 'DMG'] },
      sourcesClassic: { enum: ['PHB', 'DMG'] },
      sourcesModern: { enum: ['XPHB'] },
    },
  },
  'sources-homebrew-legacy.json': {
    $defs: { sourcesShort: { enum: ['KT'] }, sourcesColon: { enum: [] } },
  },
});

const meta = (json: string, extra: Record<string, unknown> = {}) => ({
  sources: [
    {
      json,
      abbreviation: json.slice(0, 4),
      full: json,
      version: '1',
      authors: ['A'],
      url: 'https://x',
    },
  ],
  dateAdded: 1700000000,
  dateLastModified: 1700000001,
  edition: 'classic',
  ...extra,
});

describe('findCollisions', () => {
  it('flags cross-file duplicate identities (case-insensitive)', () => {
    const r = findCollisions({
      site,
      files: [
        {
          file: 'a.json',
          doc: {
            _meta: meta('BrewAA'),
            spell: [{ name: 'Bolt', source: 'BrewAA' }],
          },
        },
        {
          file: 'b.json',
          doc: {
            _meta: meta('BrewBB'),
            spell: [{ name: 'bolt', source: 'brewaa' }],
          },
        },
      ],
    });
    const hit = r.collisions.find((c) => c.kind === 'entity');
    expect(hit?.files).toEqual(['a.json', 'b.json']);
  });

  it('flags an in-file duplicate', () => {
    const r = findCollisions({
      site,
      files: [
        {
          file: 'a.json',
          doc: {
            _meta: meta('BrewAA'),
            spell: [
              { name: 'Bolt', source: 'BrewAA' },
              { name: 'Bolt', source: 'BrewAA' },
            ],
          },
        },
      ],
    });
    expect(r.collisions.map((c) => c.kind)).toEqual(['entity-dupe']);
  });

  it('flags official identities, official source ids, duplicate and repo source ids', () => {
    const r = findCollisions({
      site,
      officialKeys: buildOfficialKeys({
        spell: [{ name: 'Fireball', source: 'PHB' }],
      }),
      repoSources: { SharedOne: 'spell/Someone; Shared.json' },
      files: [
        {
          file: 'a.json',
          doc: {
            _meta: meta('PHB'),
            spell: [{ name: 'Fireball', source: 'PHB' }],
          },
        },
        {
          file: 'b.json',
          doc: {
            _meta: meta('SharedOne'),
            feat: [{ name: 'F', source: 'SharedOne' }],
          },
        },
        {
          file: 'c.json',
          doc: {
            _meta: meta('sharedone'),
            feat: [{ name: 'G', source: 'sharedone' }],
          },
        },
      ],
    });
    const kinds = r.collisions.map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'source-official',
        'entity-official',
        'source-duplicate',
        'source-repo',
      ]),
    );
    expect(
      r.collisions.find((c) => c.kind === 'source-duplicate')?.message,
    ).toContain('case-insensitively');
  });

  it('does not flag a local copy of the same repo file', () => {
    const r = findCollisions({
      site,
      repoSources: { SharedOne: 'feat/Someone; Shared.json' },
      files: [
        {
          file: 'Someone; Shared.json',
          doc: {
            _meta: meta('SharedOne'),
            feat: [{ name: 'F', source: 'SharedOne' }],
          },
        },
      ],
    });
    expect(r.collisions).toEqual([]);
  });
});

describe('lintSubmission', () => {
  const rules = (doc: Record<string, unknown>, file = 'Author; Title.json') =>
    lintSubmission({ file, doc, site, now: 1800000000 }).issues.map(
      (i) => `${i.severity}:${i.rule}`,
    );
  const ok = {
    _meta: meta('BrewAA'),
    spell: [{ name: 'B', source: 'BrewAA' }],
  };

  it('passes a clean file (only folder advice)', () => {
    expect(rules(ok)).toEqual(['info:folder']);
  });

  it('checks file names like the repo does', () => {
    expect(rules(ok, 'my brew.json')).toContain('error:file.name');
    expect(rules(ok, 'A; Title — Two.json')).toContain('error:file.nonAscii');
  });

  it('checks _meta completeness, timestamps, and edition', () => {
    const r = rules({
      _meta: { sources: [{ json: 'BrewAA' }], dateAdded: 1700000000000 },
      spell: [{ name: 'B', source: 'BrewAA' }],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        'error:source.abbreviation',
        'error:source.full',
        'warning:source.version',
        'warning:meta.dateAdded',
        'warning:meta.dateLastModified',
        'error:meta.edition',
      ]),
    );
  });

  it('checks source ids (official, too short, legacy exempt)', () => {
    expect(
      rules({ _meta: meta('PHB'), spell: [{ name: 'B', source: 'PHB' }] }),
    ).toContain('error:source.official');
    expect(
      rules({ _meta: meta('Tiny'), spell: [{ name: 'B', source: 'Tiny' }] }),
    ).toContain('error:source.length');
    expect(
      rules({ _meta: meta('KT'), spell: [{ name: 'B', source: 'KT' }] }),
    ).not.toContain('error:source.length');
  });

  it('flags undeclared (incl. wrong-case) and unused sources', () => {
    const r = lintSubmission({
      file: 'A; B.json',
      site,
      doc: { _meta: meta('BrewAA'), spell: [{ name: 'B', source: 'brewaa' }] },
    });
    const undeclared = r.issues.find(
      (i) => i.rule === 'content.undeclaredSource',
    );
    expect(undeclared?.message).toContain('case-sensitive');
    expect(r.issues.map((i) => i.rule)).toContain('meta.unusedSource');
  });

  it('flags classic files that use 2024 sources and missing _copy dependencies', () => {
    const r = rules({
      _meta: meta('BrewAA'),
      subclass: [
        {
          name: 'S',
          source: 'BrewAA',
          _copy: { name: 'X', source: 'OtherBrew', className: 'Wizard' },
        },
      ],
      spell: [
        { name: 'B', source: 'BrewAA', entries: ['{@spell fireball|XPHB}'] },
      ],
    });
    expect(r).toEqual(
      expect.arrayContaining([
        'error:edition.modernSources',
        'error:meta.dependencies',
      ]),
    );
  });

  it('maps official-class _copy deps to the class id', () => {
    const r = lintSubmission({
      file: 'A; B.json',
      site,
      doc: {
        _meta: meta('BrewAA'),
        subclass: [
          {
            name: 'S',
            source: 'BrewAA',
            _copy: { name: 'X', source: 'PHB', className: 'Wizard' },
          },
        ],
      },
    });
    expect(
      r.issues.find((i) => i.rule === 'meta.dependencies')?.message,
    ).toContain('"wizard"');
  });

  it('flags braces, raw escapes, empty arrays; suggests a folder', () => {
    const r = lintSubmission({
      file: 'A; B.json',
      site,
      doc: {
        _meta: meta('BrewAA'),
        monster: [
          { name: 'M', source: 'BrewAA', entries: ['{@b oops', 'line\nbreak'] },
        ],
        feat: [],
      },
    });
    const ids = r.issues.map((i) => i.rule);
    expect(ids).toEqual(
      expect.arrayContaining([
        'content.braces',
        'content.escapes',
        'content.empty',
      ]),
    );
    expect(r.folder).toBe('creature');
  });
});
