/**
 * Tests for data/partnered.ts — picking the partnered brews out of a homebrew
 * repo's `_generated` indexes.
 *
 * The fixtures below are trimmed copies of the real shapes:
 *   index-meta.json     basename → { n: names, a: abbreviations, e, p: partnered }
 *   index-sources.json  source `json` code → repo-relative path
 * Note the two are keyed differently — meta by BASENAME, sources by SOURCE CODE
 * — which is the whole reason a resolution step exists.
 */
import { describe, it, expect } from 'vitest';
import {
  selectPartneredFiles,
  isPartneredEntry,
  collectDependencyCodes,
  selectDependencyFiles,
} from '../../data/partnered.ts';

const META = {
  'Sample - Giddy; Extinguish.json': { n: ['Sample'], a: ['Brew'], e: 0 },
  'Free League; The Lord of the Rings Roleplaying.json': {
    n: ['The Lord of the Rings Roleplaying'],
    a: ['TLotRR'],
    e: 0,
    p: 1,
  },
  'Kobold Press; Book of Ebon Tides.json': {
    n: ['Book of Ebon Tides'],
    a: ['BoET'],
    e: 0,
    p: 1,
  },
  'Avantris; Crooked Moon.json': {
    n: ['The Crooked Moon'],
    a: ["TCM'24", "TCM'14"],
    e: 0,
    p: 1,
  },
  'Ghostfire Gaming; Dungeons of Drakkenheim.json': {
    n: ['Dungeons of Drakkenheim'],
    a: ['DoDk'],
    e: 0,
    p: 1,
  },
  'Nobody; Orphaned Partnered Brew.json': { n: ['Orphan'], a: ['ORPH'], p: 1 },
};

const SOURCES = {
  Brew: 'action/Sample - Giddy; Extinguish.json',
  TLotRR: 'collection/Free League; The Lord of the Rings Roleplaying.json',
  BookOfEbonTides: 'collection/Kobold Press; Book of Ebon Tides.json',
  CrookedMoon24: 'collection/Avantris; Crooked Moon.json',
  CrookedMoon14: 'collection/Avantris; Crooked Moon.json',
  DungeonsDrakkenheim:
    'collection/Ghostfire Gaming; Dungeons of Drakkenheim.json',
};

describe('isPartneredEntry', () => {
  it('reads the `p` flag 5etools sets on partnered brews', () => {
    expect(isPartneredEntry({ p: 1 })).toBe(true);
    expect(isPartneredEntry({ p: true })).toBe(true);
    expect(isPartneredEntry({ p: 0 })).toBe(false);
    expect(isPartneredEntry({})).toBe(false);
    expect(isPartneredEntry(null)).toBe(false);
    expect(isPartneredEntry('nope')).toBe(false);
  });
});

describe('selectPartneredFiles', () => {
  it('keeps only the partnered entries', () => {
    const files = selectPartneredFiles(META, SOURCES);
    expect(files.map((f) => f.file)).not.toContain(
      'Sample - Giddy; Extinguish.json',
    );
  });

  it('resolves each basename to its repo-relative path', () => {
    const files = selectPartneredFiles(META, SOURCES);
    const tlotrr = files.find((f) => f.sources.includes('TLotRR'));
    expect(tlotrr?.path).toBe(
      'collection/Free League; The Lord of the Rings Roleplaying.json',
    );
  });

  it('collects every source code a file declares, as one entry', () => {
    const files = selectPartneredFiles(META, SOURCES);
    const moon = files.filter((f) => f.file === 'Avantris; Crooked Moon.json');
    expect(moon).toHaveLength(1);
    expect(moon[0].sources.sort()).toEqual(['CrookedMoon14', 'CrookedMoon24']);
  });

  it('yields the source `json` codes entities carry, not the abbreviations', () => {
    // `BoET` is the abbreviation; entities in that brew carry `BookOfEbonTides`,
    // and the blocklist is written against the latter.
    const files = selectPartneredFiles(META, SOURCES);
    const ebon = files.find((f) =>
      f.file.startsWith('Kobold Press; Book of Ebon Tides'),
    );
    expect(ebon?.sources).toEqual(['BookOfEbonTides']);
  });

  it('drops a partnered entry no source index can place', () => {
    const files = selectPartneredFiles(META, SOURCES);
    expect(files.map((f) => f.file)).not.toContain(
      'Nobody; Orphaned Partnered Brew.json',
    );
  });

  it('sorts by path, so a scan is deterministic', () => {
    const files = selectPartneredFiles(META, SOURCES);
    expect(files.map((f) => f.path)).toEqual(
      [...files.map((f) => f.path)].sort(),
    );
  });

  it('survives junk indexes rather than throwing', () => {
    expect(selectPartneredFiles({}, {})).toEqual([]);
    expect(
      selectPartneredFiles({ 'a.json': null }, { X: 42 } as never),
    ).toEqual([]);
  });
});

describe('collectDependencyCodes', () => {
  it('reads dependencies and includes across props, deduped', () => {
    expect(
      collectDependencyCodes({
        dependencies: { spell: ['KibblesTasty:CC'], item: ['X'] },
        includes: { spell: ['KibblesTasty:CC', 'Y'] },
      }).sort(),
    ).toEqual(['KibblesTasty:CC', 'X', 'Y']);
  });

  it('is empty for a brew with no _meta', () => {
    expect(collectDependencyCodes(undefined)).toEqual([]);
  });
});

describe('selectDependencyFiles', () => {
  const sourcePaths = {
    'KibblesTasty:CC': "spell/KibblesTasty; Kibbles' Casting Compendium.json",
    'KibblesTasty:Psion': 'class/KibblesTasty; Psion.json',
    Both: 'collection/Two.json',
    AlsoBoth: 'collection/Two.json',
  };

  it('resolves each file once, skipping codes the local folder holds', () => {
    const r = selectDependencyFiles(
      ['KibblesTasty:CC', 'KibblesTasty:Psion', 'Both', 'AlsoBoth'],
      sourcePaths,
      (code) => code === 'KibblesTasty:Psion',
    );
    expect(r.files).toEqual([
      { path: 'collection/Two.json', sources: ['AlsoBoth', 'Both'] },
      {
        path: "spell/KibblesTasty; Kibbles' Casting Compendium.json",
        sources: ['KibblesTasty:CC'],
      },
    ]);
    expect(r.unresolved).toEqual([]);
  });

  it('reports codes the index cannot place', () => {
    expect(
      selectDependencyFiles(['Nope'], sourcePaths, () => false).unresolved,
    ).toEqual(['Nope']);
  });
});
