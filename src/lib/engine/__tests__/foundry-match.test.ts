/**
 * Matching + inspection are tested here even though they *ship inside the
 * Foundry module* — these tests import the module's own source files directly,
 * so there is exactly one implementation and it's covered. If the import paths
 * below break, the module has moved and the bridge's contract with the manager
 * needs re-checking.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  identityTokens,
  levenshtein,
  levenshteinRatio,
  tokenJaccard,
  prepareName,
  scoreNames,
} from '../../../../foundry-homebrew-bridge/scripts/lib/match.js';
import {
  hasRealImage,
  stripHtml,
  describeDescription,
  describeActivities,
  readSource,
  readSourceIds,
  inspectDocument,
} from '../../../../foundry-homebrew-bridge/scripts/lib/inspect.js';

describe('normalizeName', () => {
  it('folds case, punctuation, and diacritics', () => {
    expect(normalizeName("Zariel's  Flame-Tongue!")).toBe(
      'zariels flame tongue',
    );
  });

  it('deletes apostrophes rather than splitting on them, so possessives stay one token', () => {
    // A space here would give ['otzi', 's', 'amulet'] and break the possessive fold.
    expect(normalizeName('Ötzi’s Amulet')).toBe('otzis amulet');
  });

  it('is total — null and undefined normalize to empty', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('identityTokens', () => {
  it('drops stopwords, de-pluralises, and sorts', () => {
    expect(identityTokens('The Sword of the Flames')).toEqual([
      'flame',
      'sword',
    ]);
  });

  it('collapses a possessive onto its bare noun', () => {
    expect(identityTokens("Zariel's Sword")).toEqual(['sword', 'zariel']);
    expect(identityTokens('Sword of Zariel')).toEqual(['sword', 'zariel']);
  });

  it('leaves short words alone so "gas" does not become "ga"', () => {
    expect(identityTokens('Gas Spore')).toEqual(['gas', 'spore']);
  });
});

describe('levenshtein', () => {
  it('measures single-character edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('ratios to 1 for identical strings and 0 for empty-vs-long', () => {
    expect(levenshteinRatio('abc', 'abc')).toBe(1);
    expect(levenshteinRatio('', '')).toBe(1);
    expect(levenshteinRatio('', 'abcd')).toBe(0);
  });
});

describe('tokenJaccard', () => {
  it('is 1 for identical sets regardless of order', () => {
    expect(tokenJaccard(['a', 'b'], ['b', 'a'])).toBe(1);
  });

  it('is 0 when nothing overlaps', () => {
    expect(tokenJaccard(['a'], ['b'])).toBe(0);
  });
});

describe('scoreNames', () => {
  const score = (a: string, b: string, opts?: Record<string, unknown>) =>
    scoreNames(prepareName(a), prepareName(b), opts);

  it('reports byte-identical names as exact', () => {
    expect(score('Flame Tongue', 'Flame Tongue')).toEqual({
      kind: 'exact',
      score: 1,
    });
  });

  it('reports case/punctuation differences as normalized, not fuzzy', () => {
    expect(score('flame tongue', 'Flame-Tongue')).toEqual({
      kind: 'normalized',
      score: 1,
    });
  });

  it('catches typos via edit distance', () => {
    const s = score('Flametounge', 'Flametongue');
    expect(s?.kind).toBe('fuzzy');
    expect(s!.score).toBeGreaterThan(0.8);
  });

  it('catches word-order swaps via token overlap — the case Levenshtein misses', () => {
    // Levenshtein alone scores this pair around 0.4; the token pass rescues it.
    expect(levenshteinRatio('sword of zariel', 'zariels sword')).toBeLessThan(
      0.6,
    );
    const s = score('Sword of Zariel', "Zariel's Sword");
    expect(s?.kind).toBe('fuzzy');
    expect(s!.score).toBe(1);
  });

  it('returns null for unrelated names', () => {
    expect(score('Flame Tongue', 'Bag of Holding')).toBeNull();
  });

  it('returns null below the threshold, and honours a stricter one', () => {
    expect(
      score('Flametounge', 'Flametongue', { fuzzyThreshold: 0.95 }),
    ).toBeNull();
  });

  it('skips the fuzzy pass entirely when disabled', () => {
    expect(score('Flametounge', 'Flametongue', { fuzzy: false })).toBeNull();
    // …but exact and normalized still work.
    expect(score('flame tongue', 'Flame Tongue', { fuzzy: false })?.kind).toBe(
      'normalized',
    );
  });
});

describe('hasRealImage', () => {
  it('rejects Foundry placeholder silhouettes', () => {
    expect(hasRealImage('icons/svg/item-bag.svg')).toBe(false);
    expect(hasRealImage('/icons/svg/mystery-man.svg')).toBe(false);
  });

  it('rejects empty and missing values', () => {
    expect(hasRealImage('')).toBe(false);
    expect(hasRealImage(undefined)).toBe(false);
    expect(hasRealImage('   ')).toBe(false);
  });

  it('accepts real art, including other icons/ subfolders', () => {
    expect(hasRealImage('icons/weapons/swords/greatsword-flamberge.webp')).toBe(
      true,
    );
    expect(hasRealImage('modules/brew-art/items/crown.webp')).toBe(true);
  });
});

describe('stripHtml / describeDescription', () => {
  it('treats an empty paragraph as no description', () => {
    expect(stripHtml('<p></p>')).toBe('');
    expect(
      describeDescription({ system: { description: { value: '<p></p>' } } }),
    ).toEqual({
      hasDescription: false,
      descriptionChars: 0,
    });
  });

  it('treats &nbsp;-only prose as no description', () => {
    expect(
      describeDescription({
        system: { description: { value: '<p>&nbsp;</p>' } },
      }).hasDescription,
    ).toBe(false);
  });

  it('counts real prose and drops script bodies', () => {
    const r = describeDescription({
      system: {
        description: {
          value: '<p>A blade that <em>burns</em>.</p><script>alert(1)</script>',
        },
      },
    });
    expect(r.hasDescription).toBe(true);
    expect(r.descriptionChars).toBe('A blade that burns .'.length);
  });

  it('falls back to an Actor biography', () => {
    expect(
      describeDescription({
        system: { details: { biography: { value: '<p>Hi</p>' } } },
      }),
    ).toEqual({
      hasDescription: true,
      descriptionChars: 2,
    });
  });
});

describe('describeActivities', () => {
  it('counts the dnd5e id-keyed object shape and collects types', () => {
    const doc = {
      system: {
        activities: {
          abc123: { type: 'attack' },
          def456: { type: 'damage' },
          ghi789: { type: 'attack' },
        },
      },
    };
    expect(describeActivities(doc)).toEqual({
      activityCount: 3,
      activityTypes: ['attack', 'damage'],
    });
  });

  it('also handles an array shape', () => {
    expect(
      describeActivities({ system: { activities: [{ type: 'save' }] } }),
    ).toEqual({
      activityCount: 1,
      activityTypes: ['save'],
    });
  });

  it('reports zero for items without activities', () => {
    expect(describeActivities({ system: {} })).toEqual({
      activityCount: 0,
      activityTypes: [],
    });
    expect(describeActivities(null)).toEqual({
      activityCount: 0,
      activityTypes: [],
    });
  });
});

describe('readSource', () => {
  it('reads both the legacy string and the object shape', () => {
    expect(readSource({ system: { source: 'DMG' } })).toBe('DMG');
    expect(readSource({ system: { source: { book: 'PHB', page: 12 } } })).toBe(
      'PHB',
    );
    expect(
      readSource({
        system: { source: { custom: 'Drakkenheim', book: 'PHB' } },
      }),
    ).toBe('Drakkenheim');
    expect(readSource({})).toBe('');
  });
});

describe('readSourceIds', () => {
  it("collects Neptunium's exact id, the book, and custom without its page", () => {
    expect(
      readSourceIds({
        flags: { plutonium: { source: 'TCE' } },
        system: { source: { book: 'TCoE', custom: 'TCoE pg. 12', page: '12' } },
      }),
    ).toEqual(['TCE', 'TCoE']);
  });

  it('reads legacy strings and actor sources, and is empty without any', () => {
    expect(readSourceIds({ system: { source: 'DMG' } })).toEqual(['DMG']);
    expect(
      readSourceIds({ system: { details: { source: { book: 'MM' } } } }),
    ).toEqual(['MM']);
    expect(
      readSourceIds({ system: { source: { book: '', custom: '' } } }),
    ).toEqual([]);
  });
});

describe('inspectDocument', () => {
  it('produces the full wire shape in one pass', () => {
    expect(
      inspectDocument({
        img: 'icons/weapons/swords/sword-flamberge.webp',
        system: {
          description: { value: '<p>Burns.</p>' },
          activities: { a1: { type: 'attack' } },
          source: { custom: 'Drakkenheim' },
        },
      }),
    ).toEqual({
      img: 'icons/weapons/swords/sword-flamberge.webp',
      hasImage: true,
      hasDescription: true,
      descriptionChars: 6,
      activityCount: 1,
      activityTypes: ['attack'],
      source: 'Drakkenheim',
      sourceIds: ['Drakkenheim'],
    });
  });

  it('degrades to all-false on an empty document rather than throwing', () => {
    expect(inspectDocument({})).toEqual({
      img: '',
      hasImage: false,
      hasDescription: false,
      descriptionChars: 0,
      activityCount: 0,
      activityTypes: [],
      source: '',
      sourceIds: [],
    });
  });
});
