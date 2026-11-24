/**
 * engine/foundry/report.ts — fold the bridge's raw matches into the report the
 * Files view renders.
 *
 * INTENT
 *   The bridge is dumb on purpose: it searches, inspects, and returns matches.
 *   Every judgement — which match is "best", what counts as a gap, when a row
 *   is too ambiguous to trust — is made here, in a pure function, so it can be
 *   unit-tested without a running Foundry.
 *
 * PICKING A BEST MATCH
 *   Sort by: source agrees → subtype matches `expect` → match kind (exact >
 *   normalized > fuzzy) → score → world before compendium (a world copy is
 *   what you actually play with). Ties at the top of that ordering are what
 *   make a row `ambiguous`.
 *
 * SOURCES
 *   A same-named document from another book is a different thing: LLAART's
 *   Flash of Genius is not TCE's. When both sides record a source and none of
 *   the matches agree, the row is `missing`, with the other versions kept for
 *   reference. A document that records no source isn't held against a match.
 */
import type {
  Candidate,
  CandidateResult,
  FoundryMatch,
  FoundryReport,
  Gap,
  ReportRow,
  ReportSummary,
  RowStatus,
} from './types.ts';

/**
 * Foundry's own spellings for some 5etools sources, which Neptunium writes to
 * `system.source.book` (plutonium/js/Bundle.js, UtilDocumentSource).
 */
const FOUNDRY_BOOK_ALIASES: [string, string][] = [
  ['TCE', 'TCoE'],
  ['XPHB', 'PHB 2024'],
  ['XDMG', 'DMG 2024'],
];

/** `PHB 2024` → `phb2024`: case, spaces and punctuation don't matter. */
const sourceKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const ALIAS_KEYS = new Map<string, string>();
for (const [a, b] of FOUNDRY_BOOK_ALIASES) {
  ALIAS_KEYS.set(sourceKey(a), sourceKey(b));
  ALIAS_KEYS.set(sourceKey(b), sourceKey(a));
}

function sourceKeys(names: string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const key = sourceKey(name);
    if (!key) continue;
    keys.add(key);
    const alias = ALIAS_KEYS.get(key);
    if (alias) keys.add(alias);
  }
  return keys;
}

/**
 * Does a Foundry document come from the homebrew's source? null when either
 * side records none, so an unlabelled document is neither credited nor blamed.
 */
export function sourceAgrees(
  candidate: Candidate,
  m: FoundryMatch,
): boolean | null {
  const ours = sourceKeys(
    candidate.sourceNames?.length ? candidate.sourceNames : [candidate.source],
  );
  const theirs = sourceKeys(m.sourceIds?.length ? m.sourceIds : [m.source]);
  if (ours.size === 0 || theirs.size === 0) return null;
  for (const key of theirs) if (ours.has(key)) return true;
  return false;
}

/** How a match's source reads in the report: `TCoE`, or empty. */
export const sourceLabel = (m: FoundryMatch): string =>
  m.source || m.sourceIds?.[0] || '';

const SOURCE_RANK = { true: 2, null: 1, false: 0 } as const;

const KIND_RANK: Record<FoundryMatch['matchKind'], number> = {
  exact: 3,
  normalized: 2,
  fuzzy: 1,
};

/** Sort key, descending. Higher is better. */
function rank(m: FoundryMatch): number[] {
  return [
    SOURCE_RANK[`${m.sourceMatch ?? null}`],
    m.typeMatch ? 1 : 0,
    KIND_RANK[m.matchKind],
    m.score,
    m.pack === 'world' ? 1 : 0,
  ];
}

function compare(a: FoundryMatch, b: FoundryMatch): number {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] !== rb[i]) return rb[i] - ra[i];
  }
  return a.name.localeCompare(b.name);
}

/** Two matches are indistinguishable if every rank component is equal. */
function tied(a: FoundryMatch, b: FoundryMatch): boolean {
  const ra = rank(a);
  const rb = rank(b);
  return ra.every((v, i) => v === rb[i]);
}

/** Which of the three checks came up empty. */
export function gapsFor(m: FoundryMatch): Gap[] {
  const gaps: Gap[] = [];
  if (!m.hasImage) gaps.push('image');
  if (!m.hasDescription) gaps.push('description');
  if (m.activityCount === 0) gaps.push('activities');
  return gaps;
}

/** One report row from a candidate and whatever the bridge found for it. */
export function buildRow(
  candidate: Candidate,
  matches: FoundryMatch[],
): ReportRow {
  if (matches.length === 0) {
    return { candidate, status: 'missing', best: null, matches: [], gaps: [] };
  }

  const sorted = matches
    .map((m) => ({ ...m, sourceMatch: sourceAgrees(candidate, m) }))
    .sort(compare);
  const best = sorted[0];

  // Best first, so a wrong-source best means every match is another book's.
  if (best.sourceMatch === false) {
    const where = sourceLabel(best);
    return {
      candidate,
      status: 'missing',
      best: null,
      matches: sorted,
      gaps: [],
      note:
        `Only another source's version is here: "${best.name}"` +
        `${where ? ` (${where})` : ''} in ${best.packLabel}. ` +
        `The ${candidate.source} one isn't in this world.`,
    };
  }
  const gaps = gapsFor(best);

  // Ambiguity beats incompleteness: if we're not sure we found the right
  // document, the gap list is describing something you may not care about.
  const duplicates = sorted.filter((m) => tied(m, best));
  let status: RowStatus;
  let note: string | undefined;

  if (best.matchKind === 'fuzzy') {
    status = 'ambiguous';
    // Don't quote the raw score: token-overlap scoring can hit 1.0 on names
    // that read as different ("Sword of Zariel" / "Zariel's Sword"), and
    // "100% similar" next to two different strings just looks broken.
    note =
      `No exact name match — closest is "${best.name}" in ${best.packLabel}. ` +
      `Confirm it's the same thing, or fix the name on one side.`;
  } else if (duplicates.length > 1) {
    status = 'ambiguous';
    note = `${duplicates.length} equally good matches across ${new Set(duplicates.map((m) => m.pack)).size} pack(s).`;
  } else if (!best.typeMatch) {
    status = 'ambiguous';
    note = `Found as a "${best.docType}" but a ${candidate.type} should import as ${candidate.expect.join(' / ')}.`;
  } else if (gaps.length > 0) {
    status = 'incomplete';
  } else {
    status = 'ok';
  }

  return { candidate, status, best, matches: sorted, gaps, note };
}

/** Roll rows up into the counters the report header shows. */
export function summarize(rows: ReportRow[]): ReportSummary {
  const s: ReportSummary = {
    total: rows.length,
    ok: 0,
    incomplete: 0,
    ambiguous: 0,
    missing: 0,
    noImage: 0,
    noDescription: 0,
    noActivities: 0,
  };
  for (const r of rows) {
    s[r.status]++;
    if (!r.best) continue;
    if (!r.best.hasImage) s.noImage++;
    if (!r.best.hasDescription) s.noDescription++;
    if (r.best.activityCount === 0) s.noActivities++;
  }
  return s;
}

/**
 * Assemble the full report. `results` may omit candidates the bridge didn't
 * answer for; those become `missing` rows rather than silently disappearing.
 */
export function buildReport(input: {
  file: string;
  world: string;
  system: string;
  candidates: Candidate[];
  results: CandidateResult[];
  elapsedMs?: number;
  searched?: { packs: number; documents: number };
  now?: number;
}): FoundryReport {
  const byId = new Map(input.results.map((r) => [r.id, r.matches ?? []]));
  const rows = input.candidates.map((c) => buildRow(c, byId.get(c.id) ?? []));

  return {
    file: input.file,
    world: input.world,
    system: input.system,
    generatedAt: input.now ?? Date.now(),
    elapsedMs: input.elapsedMs ?? 0,
    searched: input.searched ?? { packs: 0, documents: 0 },
    summary: summarize(rows),
    rows,
  };
}

/** Rows worth acting on, worst first — what the UI shows by default. */
const STATUS_ORDER: RowStatus[] = ['missing', 'ambiguous', 'incomplete', 'ok'];

export function sortRows(rows: ReportRow[]): ReportRow[] {
  return [...rows].sort((a, b) => {
    const d = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    return d !== 0 ? d : a.candidate.name.localeCompare(b.candidate.name);
  });
}
