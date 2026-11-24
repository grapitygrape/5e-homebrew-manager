/** Tests for homebrew listing metadata extracted from \_meta\. */
import { describe, it, expect } from 'vitest';
import { applyHomebrewJson, formatAuthors } from '../homebrew-meta.ts';
import type { HomebrewFileMeta } from '../source.ts';

const blank = (): HomebrewFileMeta => ({
  file: 'brew.json',
  name: 'brew.json',
  size: 0,
  counts: {},
  error: null,
  authors: '',
  sources: [],
  mtime: 0,
  dateLastModified: 0,
});

describe('formatAuthors', () => {
  it('joins a string array with commas', () => {
    expect(formatAuthors(['Alex', 'Ada'])).toBe('Alex, Ada');
  });
  it('returns a trimmed string author as-is', () => {
    expect(formatAuthors('  Alex  ')).toBe('Alex');
  });
  it('returns empty when authors is missing or empty', () => {
    expect(formatAuthors(undefined)).toBe('');
    expect(formatAuthors([])).toBe('');
    expect(formatAuthors(null)).toBe('');
  });
});

describe('applyHomebrewJson', () => {
  it('reads _meta.dateLastModified, leaving 0 when absent', () => {
    const dated = blank();
    applyHomebrewJson(dated, { _meta: { dateLastModified: 1794153308 } });
    expect(dated.dateLastModified).toBe(1794153308);
    const undated = blank();
    applyHomebrewJson(undated, { _meta: {} });
    expect(undated.dateLastModified).toBe(0);
  });

  it('sets name, authors, sources and entity counts from _meta and arrays', () => {
    const meta = blank();
    applyHomebrewJson(meta, {
      _meta: {
        sources: [
          {
            json: 'MyHomebrewItems',
            abbreviation: 'HB',
            full: 'My Brew',
            authors: ['Alex'],
            color: '09EDBC',
          },
        ],
      },
      item: [{ name: 'A' }, { name: 'B' }],
      spell: [{ name: 'C' }],
    });
    expect(meta.name).toBe('My Brew');
    expect(meta.authors).toBe('Alex');
    expect(meta.sources).toEqual([
      { json: 'MyHomebrewItems', abbreviation: 'HB', color: '#09EDBC' },
    ]);
    expect(meta.counts).toEqual({ item: 2, spell: 1 });
  });
  it('keeps every declared source, not just the first', () => {
    const meta = blank();
    applyHomebrewJson(meta, {
      _meta: {
        sources: [
          { json: 'LLAF', abbreviation: 'LLAF' },
          { json: 'LLAF:E', abbreviation: 'LLAF:E' },
        ],
      },
    });
    expect(meta.sources.map((s) => s.json)).toEqual(['LLAF', 'LLAF:E']);
  });
  it('falls back to the source json id when there is no abbreviation', () => {
    const meta = blank();
    applyHomebrewJson(meta, { _meta: { sources: [{ json: 'MyBrew' }] } });
    expect(meta.sources[0].abbreviation).toBe('MyBrew');
  });
  it('skips a source record with no json id', () => {
    const meta = blank();
    applyHomebrewJson(meta, { _meta: { sources: [{ abbreviation: 'X' }] } });
    expect(meta.sources).toEqual([]);
  });
  it('leaves the filename as name when _meta.sources[0].full is absent', () => {
    const meta = blank();
    applyHomebrewJson(meta, { item: [{ name: 'A' }] });
    expect(meta.name).toBe('brew.json');
    expect(meta.authors).toBe('');
    expect(meta.sources).toEqual([]);
    expect(meta.counts).toEqual({ item: 1 });
  });
  it('takes the night colour first, since the app is dark', () => {
    const meta = blank();
    applyHomebrewJson(meta, {
      _meta: {
        sources: [{ json: 'A', color: '825494', colorNight: '9661ab' }],
      },
    });
    expect(meta.sources[0].color).toBe('#9661ab');
  });
  it('falls back to the day colour', () => {
    const meta = blank();
    applyHomebrewJson(meta, {
      _meta: { sources: [{ json: 'A', color: 'c7af28' }] },
    });
    expect(meta.sources[0].color).toBe('#c7af28');
  });
  it('leaves the colour empty when it is missing or not hex', () => {
    const missing = blank();
    applyHomebrewJson(missing, { _meta: { sources: [{ json: 'A' }] } });
    expect(missing.sources[0].color).toBe('');
    const junk = blank();
    applyHomebrewJson(junk, {
      _meta: { sources: [{ json: 'A', color: 'red; x: y' }] },
    });
    expect(junk.sources[0].color).toBe('');
  });
});
