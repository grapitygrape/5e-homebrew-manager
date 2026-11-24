/**
 * engine/blocklist/diagnose.ts — check loaded rules, and repair the fixable ones.
 *
 * INTENT
 *   A blocklist file is a set of string keys with no referential integrity: a
 *   rule whose hash is one character off is not an error anywhere, it's just a
 *   rule that never fires. This module resolves every loaded rule against the
 *   real content index, says which ones don't point at anything, and — where the
 *   intent is unambiguous — rewrites them to the form 5etools will honour, so
 *   saving repairs the file instead of preserving the rot.
 *
 * WHAT IT CATCHES (all observed in the wild)
 *   - Name-only hashes: `fireball` where 5etools writes `fireball_phb`.
 *   - Over-encoded hashes: `acid%20%28vial%29` where 5etools writes `acid%20(vial)`
 *     (`encodeURIComponent` leaves parens and apostrophes alone).
 *   - Parent-page categories: `subrace` rules filed under `race`, `subclass`
 *     under `class`, `optionalfeature` under `feat`.
 *   - Rules for content that isn't installed — reported, never rewritten, since
 *     the user may be blocking a source they intend to add later.
 *
 * DELIBERATE NON-GOAL
 *   Nothing here guesses. A repair is only applied when exactly one candidate
 *   matches; ambiguous cases are reported for the user to decide.
 */
import {
  LEGACY_CATEGORY_ALIASES,
  isBlockableProp,
  propLabel,
} from './catalog.ts';
import { entryKey, describeEntry } from './entries.ts';
import type { BlocklistEntry } from './entries.ts';

/** One entity as held by the content index. */
export interface IndexedEntity {
  prop: string;
  source: string;
  hash: string;
  name: string;
}

/** The read side of the content index, as diagnosis needs it. */
export interface ContentLookup {
  hasSource(source: string): boolean;
  /** Exact hash match within a prop. */
  find(prop: string, hash: string): IndexedEntity | undefined;
  /** All entities in a source with this display name, across every prop. */
  findByName(source: string, name: string): IndexedEntity[];
}

export type DiagnosisLevel = 'ok' | 'info' | 'warning' | 'error';

export interface EntryDiagnosis {
  /**
   * Identity of the rule this is about — `entryKey` of the entry AFTER any
   * repair, so it matches what the UI renders. Deliberately not an array index:
   * the list is edited (rows get removed), and a positional reference would
   * slide onto its neighbour the moment anything above it disappears.
   */
  key: string;
  level: DiagnosisLevel;
  /** Short machine code, e.g. 'legacy-hash', 'unknown-source'. */
  code: string;
  message: string;
  /** The corrected entry, when a repair was applied. */
  repaired?: BlocklistEntry;
}

export interface DiagnosisReport {
  /** Keyed by rule identity; every `key` matches exactly one row in `entries`. */
  diagnoses: EntryDiagnosis[];
  /** The entry list with every applicable repair applied, in original order. */
  entries: BlocklistEntry[];
  counts: Record<DiagnosisLevel, number>;
  repairedCount: number;
  /**
   * Rules that became identical to an earlier rule once repaired, and were
   * dropped. One human-readable line each.
   */
  collapsed: string[];
}

/** Undo the over-encoding an older build applied to `(`, `)` and `'`. */
const decodeOverEncoded = (hash: string): string =>
  hash.replace(/%28/gi, '(').replace(/%29/gi, ')').replace(/%27/gi, "'");

/** Candidate hashes for a rule that didn't resolve as written. */
function hashCandidates(
  hash: string,
  source: string,
): { hash: string; code: string; why: string }[] {
  const out: { hash: string; code: string; why: string }[] = [];
  const src = source.toLowerCase();
  const decoded = decodeOverEncoded(hash);

  if (decoded !== hash) {
    out.push({
      hash: decoded,
      code: 'over-encoded-hash',
      why: 'parentheses/apostrophes were percent-encoded',
    });
  }
  // A hash that doesn't already end in `_<source>` is probably a name-only hash.
  if (!hash.endsWith(`_${src}`)) {
    out.push({
      hash: `${hash}_${src}`,
      code: 'legacy-hash',
      why: 'the source suffix was missing',
    });
    if (decoded !== hash) {
      out.push({
        hash: `${decoded}_${src}`,
        code: 'legacy-hash',
        why: 'the source suffix was missing and parentheses/apostrophes were percent-encoded',
      });
    }
  }
  return out;
}

/** Props worth trying when a rule's category doesn't resolve. */
function categoryCandidates(category: string): string[] {
  return LEGACY_CATEGORY_ALIASES[category] ?? [];
}

// `key` is a placeholder here; pass 2 stamps the real identity once it knows
// which entry (original or repaired) actually made it into the list.
const ok = (): EntryDiagnosis => ({
  key: '',
  level: 'ok',
  code: 'ok',
  message: '',
});

function diagnoseOne(
  entry: BlocklistEntry,
  lookup: ContentLookup,
): EntryDiagnosis {
  const { hash, category, source } = entry;

  // Wildcard source is a global rule — nothing to resolve against.
  if (source === '*') return ok();

  if (!lookup.hasSource(source)) {
    return {
      key: '',
      level: 'warning',
      code: 'unknown-source',
      message: `"${source}" isn't in your data. Rule kept, but it blocks nothing.`,
    };
  }

  // Wildcard hash: the rule targets a whole category (or the whole source).
  if (hash === '*') {
    if (category === '*') return ok();
    if (!isBlockableProp(category)) {
      return {
        key: '',
        level: 'warning',
        code: 'unknown-category',
        message: `"${category}" isn't a type 5etools blocks. Kept as-is — check it by hand.`,
      };
    }
    return ok();
  }

  // Specific entity: does it resolve exactly as written?
  if (lookup.find(category, hash)) return ok();

  // 1. Right hash, wrong (parent-page) category.
  for (const alt of categoryCandidates(category)) {
    if (lookup.find(alt, hash)) {
      return {
        key: '',
        level: 'warning',
        code: 'legacy-category',
        message: `Filed as ${propLabel(category)}, resolves as ${propLabel(alt)}. Repaired.`,
        repaired: { ...entry, category: alt },
      };
    }
  }

  // 2. Malformed hash, right category.
  for (const cand of hashCandidates(hash, source)) {
    const hit = lookup.find(category, cand.hash);
    if (hit) {
      return {
        key: '',
        level: 'warning',
        code: cand.code,
        message: `Hash matched nothing — ${cand.why}. Repaired to "${cand.hash}".`,
        repaired: {
          ...entry,
          hash: cand.hash,
          displayName: entry.displayName || hit.name,
        },
      };
    }
  }

  // 3. Malformed hash AND wrong category.
  for (const alt of categoryCandidates(category)) {
    for (const cand of hashCandidates(hash, source)) {
      const hit = lookup.find(alt, cand.hash);
      if (hit) {
        return {
          key: '',
          level: 'warning',
          code: cand.code,
          message: `Hash matched nothing — ${cand.why} — and the type was ${propLabel(category)}, not ${propLabel(alt)}. Repaired.`,
          repaired: {
            ...entry,
            hash: cand.hash,
            category: alt,
            displayName: entry.displayName || hit.name,
          },
        };
      }
    }
  }

  // 4. Last resort: match the display name inside the source. Only when unambiguous.
  const named =
    entry.displayName && entry.displayName !== '*'
      ? lookup.findByName(source, entry.displayName)
      : [];
  if (named.length === 1) {
    const hit = named[0];
    return {
      key: '',
      level: 'warning',
      code: 'name-matched',
      message: `Hash matched nothing. Resolved by name to ${propLabel(hit.prop)} "${hit.name}". Repaired.`,
      repaired: { ...entry, hash: hit.hash, category: hit.prop },
    };
  }
  if (named.length > 1) {
    return {
      key: '',
      level: 'error',
      code: 'ambiguous',
      message: `Hash matched nothing, and "${entry.displayName}" matches ${named.length} entries in ${source}. Left alone — fix by hand.`,
    };
  }

  return {
    key: '',
    level: 'error',
    code: 'unresolved',
    message: `No ${propLabel(category)} in ${source} matches "${hash}". Probably renamed or removed. Left alone.`,
  };
}

/**
 * Diagnose every rule and return the repaired list. `entries` is safe to save:
 * repairs are applied, everything else is passed through byte-identical, and
 * the result is guaranteed free of duplicate identities.
 *
 * THE SECOND PASS IS NOT OPTIONAL. Repairs are decided per rule, so two rules
 * can independently land on the same `hash__category__source`. A real case: a
 * file carried `Custom Lineage` twice for TCE, once as `class` and once as
 * `race`. They're distinct on disk; repairing the bogus `class` rule to `race`
 * — which is right, it isn't a class — makes them the same rule. Left in, that
 * ships a list with two rows sharing one identity.
 */
export function diagnoseBlocklist(
  entries: BlocklistEntry[],
  lookup: ContentLookup,
): DiagnosisReport {
  // Pass 1 — resolve and repair each rule on its own.
  const results = entries.map((entry) => {
    const diagnosis = diagnoseOne(entry, lookup);
    return {
      original: entry,
      resolved: diagnosis.repaired ?? entry,
      diagnosis,
    };
  });

  // Pass 2 — collapse identities the repairs collided into, and stamp each
  // diagnosis with the identity of the row the UI will actually render.
  const counts: Record<DiagnosisLevel, number> = {
    ok: 0,
    info: 0,
    warning: 0,
    error: 0,
  };
  const diagnoses: EntryDiagnosis[] = [];
  const kept: BlocklistEntry[] = [];
  const collapsed: string[] = [];
  /** key → how the row already holding it got there, for an honest message. */
  const seen = new Map<
    string,
    { original: BlocklistEntry; wasRepaired: boolean }
  >();
  let repairedCount = 0;

  for (const { original, resolved, diagnosis } of results) {
    const key = entryKey(resolved);
    const holder = seen.get(key);
    if (holder) {
      // Say which of the three ways this collision happened. "Listed twice" when
      // a repair caused it would send the user hunting for a duplicate that
      // isn't in their file.
      if (diagnosis.repaired) {
        collapsed.push(
          `${describeEntry(original)} was repaired to ${describeEntry(resolved)}, which the list already had — dropped as a duplicate.`,
        );
      } else if (holder.wasRepaired) {
        collapsed.push(
          `${describeEntry(original)} became a duplicate once ${describeEntry(holder.original)} was repaired to match it — dropped.`,
        );
      } else {
        collapsed.push(
          `${describeEntry(original)} was listed twice — dropped as a duplicate.`,
        );
      }
      continue;
    }
    seen.set(key, { original, wasRepaired: !!diagnosis.repaired });
    counts[diagnosis.level]++;
    if (diagnosis.repaired) repairedCount++;
    if (diagnosis.level !== 'ok') diagnoses.push({ ...diagnosis, key });
    kept.push(resolved);
  }

  return { diagnoses, entries: kept, counts, repairedCount, collapsed };
}
