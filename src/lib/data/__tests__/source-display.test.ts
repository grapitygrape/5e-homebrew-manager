/** Tests for resolving any source id to how 5etools shows it. */
import { describe, it, expect } from 'vitest';
import {
  createSourceResolver,
  type SourceDisplayIo,
} from '../source-display.ts';
import { applyHomebrewJson, blankHomebrewMeta } from '../homebrew-meta.ts';

const PARSER_JS = `
Parser.SRC_XPHB = "XPHB";
Parser.SOURCE_JSON_TO_ABV = {};
Parser.SOURCE_JSON_TO_ABV[Parser.SRC_XPHB] = "PHB'24";
`;
const MAIN_CSS = '.ve-night-mode .ve-source__XPHB{color:#d98d2a !important}';

const localBrew = (sources: Record<string, unknown>[]) => {
  const meta = blankHomebrewMeta('brew.json');
  applyHomebrewJson(meta, { _meta: { sources } });
  return meta;
};

/** A fake site, homebrew folder and repo, keyed by path; counts repo reads. */
function fakeIo(opts: {
  site?: Record<string, string>;
  local?: Record<string, unknown>[][];
  repoPaths?: Record<string, string>;
  repoFiles?: Record<string, Record<string, unknown>[]>;
}) {
  const repoReads: string[] = [];
  const io: SourceDisplayIo = {
    readSiteFile: async (rel) => opts.site?.[rel] ?? null,
    listHomebrew: async () => ({
      path: '',
      exists: true,
      files: (opts.local ?? []).map(localBrew),
    }),
    repoSourcePaths: async () => opts.repoPaths ?? {},
    readRepoFile: async (rel) => {
      repoReads.push(rel);
      const sources = opts.repoFiles?.[rel];
      return sources ? { _meta: { sources } } : null;
    },
  };
  return { io, repoReads };
}

const SITE = { 'js/parser.js': PARSER_JS, 'css/main.css': MAIN_CSS };

describe('createSourceResolver', () => {
  it('resolves official sources from the site files', async () => {
    const { io } = fakeIo({ site: SITE });
    const out = await createSourceResolver(io)(['XPHB']);
    expect(out.xphb).toEqual({
      json: 'XPHB',
      abbreviation: "PHB'24",
      color: '#d98d2a',
    });
  });

  it('resolves local brews from their _meta, ignoring case', async () => {
    const { io } = fakeIo({
      local: [
        [{ json: 'SpellsThatDontSuck', abbreviation: 'SDS', color: 'aa0000' }],
      ],
    });
    const out = await createSourceResolver(io)(['spellsthatdontsuck']);
    expect(out.spellsthatdontsuck?.abbreviation).toBe('SDS');
  });

  it('reads a repo brew only for ids it has not found, once per file', async () => {
    const { io, repoReads } = fakeIo({
      site: SITE,
      repoPaths: {
        CrookedMoon14: 'collection/Avantris; Crooked Moon.json',
        CrookedMoon24: 'collection/Avantris; Crooked Moon.json',
        XPHB: 'never/read.json',
      },
      repoFiles: {
        'collection/Avantris; Crooked Moon.json': [
          { json: 'CrookedMoon14', abbreviation: "TCM'14", color: '324F68' },
          { json: 'CrookedMoon24', abbreviation: "TCM'24", color: '607F94' },
        ],
      },
    });
    const resolve = createSourceResolver(io);
    const out = await resolve(['XPHB', 'CrookedMoon14', 'CrookedMoon24']);
    expect(out.crookedmoon14?.abbreviation).toBe("TCM'14");
    expect(out.crookedmoon24?.color).toBe('#607F94');
    await resolve(['CrookedMoon14']);
    expect(repoReads).toEqual(['collection/Avantris; Crooked Moon.json']);
  });

  it('prefers the local brew over the repo copy', async () => {
    const { io, repoReads } = fakeIo({
      local: [[{ json: 'KibbleInventor', abbreviation: 'KT:I' }]],
      repoPaths: { KibbleInventor: 'class/KibblesTasty; Inventor.json' },
    });
    const out = await createSourceResolver(io)(['KibbleInventor']);
    expect(out.kibbleinventor?.abbreviation).toBe('KT:I');
    expect(repoReads).toEqual([]);
  });

  it('answers null for an id nothing declares', async () => {
    const { io } = fakeIo({ site: SITE });
    const out = await createSourceResolver(io)(['Nowhere']);
    expect(out).toEqual({ nowhere: null });
  });

  it('still answers when the site and folders are missing', async () => {
    const { io } = fakeIo({});
    io.listHomebrew = async () => {
      throw new Error('no folder');
    };
    const out = await createSourceResolver(io)(['XPHB']);
    expect(out).toEqual({ xphb: null });
  });
});
