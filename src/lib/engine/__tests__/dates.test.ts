/** Tests for engine/blocklist/dates.ts — deriving a source's "added" date. */
import { describe, it, expect } from 'vitest';
import {
  parsePublishedDate,
  parseBrewDateAdded,
  preferDate,
  compareSourceDates,
} from '../blocklist/dates.ts';

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('parsePublishedDate', () => {
  it('reads a 5etools published date as UTC midnight', () => {
    expect(parsePublishedDate('2014-08-19')).toBe(utc(2014, 8, 19));
  });

  it('is timezone-stable — the calendar day never drifts', () => {
    // Parsed as local time this lands on the 18th west of Greenwich.
    const d = new Date(parsePublishedDate('2014-08-19')!);
    expect(d.getUTCDate()).toBe(19);
    expect(d.getUTCMonth()).toBe(7);
  });

  it('rejects anything that is not a strict YYYY-MM-DD string', () => {
    for (const bad of [
      '19 Aug 2014',
      '2014-8-9',
      '2014/08/19',
      '',
      '   ',
      null,
      undefined,
      1408406400,
      {},
    ]) {
      expect(parsePublishedDate(bad)).toBeNull();
    }
  });

  it('rejects a well-formed string that is not a real date', () => {
    expect(parsePublishedDate('2014-13-01')).toBeNull();
    expect(parsePublishedDate('2014-02-30')).toBeNull();
  });
});

describe('parseBrewDateAdded', () => {
  it('converts epoch seconds to epoch ms', () => {
    // Chronicles of Eberron's real stamp.
    expect(parseBrewDateAdded(1709084551)).toBe(1709084551000);
  });

  it('accepts a numeric string', () => {
    expect(parseBrewDateAdded('1709084551')).toBe(1709084551000);
  });

  it('passes through a value already in milliseconds', () => {
    // Seconds this large would be the year 56000; the only sane reading is ms.
    expect(parseBrewDateAdded(1709084551000)).toBe(1709084551000);
  });

  it('rejects missing, zero, negative, and non-numeric values', () => {
    for (const bad of [
      undefined,
      null,
      0,
      '0',
      -1,
      NaN,
      Infinity,
      '',
      'soon',
      {},
      [],
    ]) {
      expect(parseBrewDateAdded(bad)).toBeNull();
    }
  });
});

describe('preferDate', () => {
  const brew = { at: 200, kind: 'brew' as const };
  const published = { at: 100, kind: 'published' as const };

  it('takes the candidate when nothing is recorded yet', () => {
    expect(preferDate(undefined, published)).toEqual(published);
  });

  it('lets a brew stamp beat a published date, whichever arrives first', () => {
    expect(preferDate(published, brew)).toEqual(brew);
    expect(preferDate(brew, published)).toEqual(brew);
  });

  it('keeps the earlier stamp when both are the same kind', () => {
    const earlier = { at: 50, kind: 'brew' as const };
    expect(preferDate(brew, earlier)).toEqual(earlier);
    expect(preferDate(earlier, brew)).toEqual(earlier);
  });
});

describe('compareSourceDates', () => {
  const sorted = (list: (number | null)[], dir: 'asc' | 'desc') =>
    [...list].sort((a, b) => compareSourceDates(a, b, dir));

  it('orders oldest first ascending, newest first descending', () => {
    expect(sorted([300, 100, 200], 'asc')).toEqual([100, 200, 300]);
    expect(sorted([300, 100, 200], 'desc')).toEqual([300, 200, 100]);
  });

  it('sinks undated sources to the bottom in BOTH directions', () => {
    // Reversing the sort should not float the unknowns to the top — "no date"
    // is missing information, not an extreme value.
    expect(sorted([null, 300, null, 100], 'asc')).toEqual([
      100,
      300,
      null,
      null,
    ]);
    expect(sorted([null, 300, null, 100], 'desc')).toEqual([
      300,
      100,
      null,
      null,
    ]);
  });

  it('treats two undated sources as equal, leaving the prior order intact', () => {
    expect(compareSourceDates(null, null, 'asc')).toBe(0);
    expect(compareSourceDates(null, null, 'desc')).toBe(0);
  });
});
