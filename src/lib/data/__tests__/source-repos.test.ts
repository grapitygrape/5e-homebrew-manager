/** Setup's repo list and the paths derived from it. */
import { describe, it, expect } from 'vitest';
import {
  SOURCE_REPOS,
  defaultRepoFolders,
  derivedSources,
  legacyRepoPaths,
  toolsRepoPath,
  commonParent,
} from '../source-repos.ts';
import type { DataSourceConfig } from '../source.ts';

const sample: DataSourceConfig = {
  data: { path: 'C:/repos/5e/data' },
  schema: { path: 'C:/repos/5etools-utils/schema/brew' },
  guides: { path: './guides' },
  homebrew: { path: 'C:/repos/5e/homebrew' },
  partnered: { path: 'C:/repos/5e-homebrew' },
};

describe('SOURCE_REPOS', () => {
  it('lists the repos in order, with the image repos optional', () => {
    expect(SOURCE_REPOS.map((r) => [r.id, r.label, r.required])).toEqual([
      ['tools', 'Tools source', true],
      ['siteImages', 'Images source', false],
      ['homebrew', 'Homebrew files', true],
      ['images', 'Homebrew images', false],
      ['utils', 'Homebrew utilities', true],
    ]);
    expect(SOURCE_REPOS.map((r) => r.hint)).toEqual([
      'https://github.com/…/tools',
      'https://github.com/…/images',
      'https://github.com/…/homebrew',
      'https://github.com/…/homebrew-img',
      'https://github.com/…/utilities',
    ]);
  });
});

describe('defaultRepoFolders', () => {
  it('nests the repos in 5e-data, with images inside the tools folder', () => {
    expect(defaultRepoFolders('C:/Users/you/Documents')).toEqual({
      tools: 'C:/Users/you/Documents/5e-data/5e',
      siteImages: 'C:/Users/you/Documents/5e-data/5e/img',
      homebrew: 'C:/Users/you/Documents/5e-data/homebrew',
      images: 'C:/Users/you/Documents/5e-data/5e/homebrew-img',
      utils: 'C:/Users/you/Documents/5e-data/utils',
    });
  });

  it("doesn't add a second 5e-data when that's the folder chosen", () => {
    expect(defaultRepoFolders('D:/5E-Data').tools).toBe('D:/5E-Data/5e');
  });
});

describe('SOURCE_REPOS descriptions', () => {
  it('describes the homebrew and images folders', () => {
    const byId = Object.fromEntries(SOURCE_REPOS.map((r) => [r.id, r]));
    expect(byId.homebrew.description).toBe(
      'If added, where the staging homebrew will be stored.',
    );
    expect(byId.images.description).toBe(
      'If added, where the homebrew images will be stored.',
    );
    expect(byId.siteImages.description).toBe(
      'If added, where the images will be stored.',
    );
    expect(byId.tools.description).toBeUndefined();
  });
});

describe('derivedSources', () => {
  it('points the sources into the repo folders', () => {
    expect(
      derivedSources({
        tools: { url: '', path: 'C:/h/tools' },
        homebrew: { url: '', path: 'C:/h/homebrew' },
        utils: { url: '', path: 'C:/h/utils' },
      }),
    ).toEqual({
      data: { path: 'C:/h/tools/data' },
      homebrew: { path: 'C:/h/tools/homebrew' },
      schema: { path: 'C:/h/utils/schema/brew' },
      partnered: { path: 'C:/h/homebrew' },
    });
  });

  it('leaves out sources whose repo has no folder', () => {
    expect(derivedSources({ utils: { url: '', path: ' ' } })).toEqual({});
  });
});

describe('legacyRepoPaths', () => {
  it('works back from an existing config', () => {
    expect(legacyRepoPaths(sample)).toEqual({
      tools: 'C:/repos/5e',
      siteImages: 'C:/repos/5e/img',
      homebrew: 'C:/repos/5e-homebrew',
      images: 'C:/repos/5e/homebrew-img',
      utils: 'C:/repos/5etools-utils',
    });
  });

  it('is empty where the config says nothing', () => {
    expect(
      legacyRepoPaths({
        data: {},
        schema: { url: 'https://x/schema' },
        guides: {},
        homebrew: {},
      }),
    ).toEqual({
      tools: '',
      siteImages: '',
      homebrew: '',
      images: '',
      utils: '',
    });
  });
});

describe('toolsRepoPath', () => {
  const none = { data: {}, schema: {}, guides: {}, homebrew: {} };

  it("prefers setup's repo path, then the folder above data/", () => {
    expect(
      toolsRepoPath({ tools: { url: '', path: ' C:/h/tools ' } }, sample),
    ).toBe('C:/h/tools');
    expect(toolsRepoPath({ tools: { url: '', path: '' } }, sample)).toBe(
      'C:/repos/5e',
    );
    expect(toolsRepoPath(undefined, sample)).toBe('C:/repos/5e');
  });

  it('is empty before setup has a tools folder', () => {
    expect(toolsRepoPath(undefined, none)).toBe('');
    expect(toolsRepoPath({}, none)).toBe('');
  });
});

describe('commonParent', () => {
  it('finds the shared folder', () => {
    expect(
      commonParent([
        'C:/repos/5e',
        'C:/repos/5e-homebrew',
        'C:/repos/5e/homebrew-img',
        'C:/repos/5etools-utils',
      ]),
    ).toBe('C:/repos');
  });

  it('ignores empty entries and gives empty for none', () => {
    expect(commonParent(['', 'C:/a/b/tools', 'C:/a/b/utils'])).toBe('C:/a/b');
    expect(commonParent([])).toBe('');
  });
});
