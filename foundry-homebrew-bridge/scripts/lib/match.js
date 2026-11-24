/**
 * lib/match.js — name normalisation and fuzzy scoring.
 *
 * PURE. No Foundry globals, no DOM, no imports. That is deliberate: the
 * homebrew manager's Vitest suite imports this exact file so the matching rules
 * are tested once, in one place, instead of being reimplemented on both sides
 * of the bridge. Keep it that way — if you need `game` or `document` in here,
 * you're writing it in the wrong file.
 *
 * THREE PASSES, cheapest first
 *   exact       byte-identical names
 *   normalized  case/diacritic/punctuation-insensitive
 *   fuzzy       max(Levenshtein ratio, stopword-stripped token Jaccard)
 *
 * The two fuzzy measures cover different failure modes: Levenshtein catches
 * typos and stray characters ("Flametounge" → "Flametongue"); token Jaccard
 * catches word-order swaps ("Sword of Zariel" → "Zariel's Sword") that
 * Levenshtein scores terribly.
 */

/** Words that carry no identity in a D&D item name. Dropped before Jaccard. */
const STOPWORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'de', 'la']);

/** Longer than this and we skip the O(n*m) pass — nothing legitimate is close. */
const MAX_LEV_LEN = 120;

/**
 * Case-fold, strip diacritics, drop punctuation, collapse whitespace.
 * `Zariel's  Flame-Tongue!` → `zariels flame tongue`
 *
 * Apostrophes are *deleted* rather than turned into spaces, so a possessive
 * stays one token (`zariels`) and `identityTokens` can then fold it onto
 * `zariel`. Every other separator becomes a space.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '') // combining marks left behind by NFD
    .replace(/['’‘`´]/g, '') // possessives and typographic quotes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Identity tokens: normalized, stopwords removed, possessive/plural `s` stripped.
 * `zariels sword of the flame` → `['flame', 'sword', 'zariel']` (sorted)
 * @param {unknown} value
 * @returns {string[]}
 */
export function identityTokens(value) {
  const tokens = normalizeName(value)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    // Strip a trailing `s` on words of 4+ letters so possessives and plurals
    // collapse together. Short words ("gas", "ops") are left alone.
    .map((t) => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t));
  return [...new Set(tokens)].sort();
}

/**
 * Levenshtein edit distance, single-row DP.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/**
 * Edit distance as a 0–1 similarity.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinRatio(a, b) {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  if (longest > MAX_LEV_LEN) return 0;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Jaccard overlap of two identity-token sets.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
export function tokenJaccard(a, b) {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of a) if (setB.has(t)) shared++;
  return shared / (a.length + b.length - shared);
}

/**
 * Everything a name needs precomputed, so an index entry is prepared once and
 * compared against many queries.
 * @param {string} name
 * @returns {{ raw: string, norm: string, tokens: string[] }}
 */
export function prepareName(name) {
  const raw = String(name ?? '');
  return { raw, norm: normalizeName(raw), tokens: identityTokens(raw) };
}

/**
 * Score one prepared query against one prepared document name.
 *
 * @param {{ raw: string, norm: string, tokens: string[] }} query
 * @param {{ raw: string, norm: string, tokens: string[] }} doc
 * @param {{ fuzzy?: boolean, fuzzyThreshold?: number }} [options]
 * @returns {{ kind: 'exact'|'normalized'|'fuzzy', score: number } | null}
 *   `null` when the pair isn't close enough to report.
 */
export function scoreNames(query, doc, options = {}) {
  const { fuzzy = true, fuzzyThreshold = 0.72 } = options;

  if (query.raw === doc.raw) return { kind: 'exact', score: 1 };
  if (query.norm && query.norm === doc.norm)
    return { kind: 'normalized', score: 1 };
  if (!fuzzy) return null;

  const score = Math.max(
    levenshteinRatio(query.norm, doc.norm),
    tokenJaccard(query.tokens, doc.tokens),
  );
  return score >= fuzzyThreshold
    ? { kind: 'fuzzy', score: Math.round(score * 1000) / 1000 }
    : null;
}
