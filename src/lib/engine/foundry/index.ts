/**
 * engine/foundry/index.ts — barrel for the Foundry-check feature.
 *
 * Deliberately NOT re-exported from engine/index.ts: these names (Candidate,
 * ReportRow, MatchKind…) are generic enough to collide with the audit and
 * item-list vocabulary already in the root barrel. Import from
 * `$lib/engine/foundry` explicitly and the provenance stays obvious at the
 * call site.
 */
export * from './types.ts';
export {
  TYPE_MAP,
  CHECKED_TYPES,
  metaSource,
  buildCandidates,
  candidateCounts,
} from './candidates.ts';
export {
  gapsFor,
  buildRow,
  summarize,
  buildReport,
  sortRows,
} from './report.ts';
