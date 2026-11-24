/**
 * engine/blocklist/index.ts — content-blocklist authoring.
 *
 * The sub-domain behind the Hide Content: 5etools-compatible entity hashes,
 * the set of blockable content types, lossless parse/serialize of the file, and
 * the diagnose/repair pass that runs on load. All pure — the server layer feeds
 * it a content index, the UI renders what comes back.
 *
 * Not to be confused with `engine/merge/blocklist.ts`, which answers the much
 * narrower merge-time question "is this entity hidden?".
 */
export {
  toUrlified,
  encodeForHash,
  entitySource,
  entityHash,
  HASH_BUILDERS,
  isWildcard,
} from './hash.ts';
export type { HashBuilder, HashableEntity } from './hash.ts';

export {
  BLOCKLIST_PROPS,
  BLOCKLIST_PROP_ORDER,
  propLabel,
  isBlockableProp,
  SKIPPED_DATA_DIRS,
  isIndexableDataFile,
  categoryForProp,
  LEGACY_CATEGORY_ALIASES,
} from './catalog.ts';

export {
  parseBlocklistDocument,
  serializeBlocklistDocument,
  emptyEnvelope,
  entryKey,
  describeEntry,
  mergeEntries,
  sortEntries,
} from './entries.ts';
export type { BlocklistEntry, BlocklistDocument } from './entries.ts';

export {
  parsePublishedDate,
  parseBrewDateAdded,
  preferDate,
  compareSourceDates,
} from './dates.ts';
export type { SourceDate, SourceDateKind } from './dates.ts';

export { allocateRowBudget } from './budget.ts';
export type { BudgetGroup, BudgetResult } from './budget.ts';

export { unblockNode } from './unblock.ts';
export type {
  UnblockTarget,
  UnblockContext,
  UnblockResult,
} from './unblock.ts';

export {
  flattenRaces,
  flattenRacesWithParents,
  getSubraceName,
} from './races.ts';
export type {
  RawRace,
  RawSubrace,
  FlatRace,
  FlatRaceChildLink,
  FlattenedRacesResult,
} from './races.ts';

export { diagnoseBlocklist } from './diagnose.ts';
export type {
  ContentLookup,
  IndexedEntity,
  EntryDiagnosis,
  DiagnosisReport,
  DiagnosisLevel,
} from './diagnose.ts';

export {
  entityGraphKey,
  extractParentLinks,
  extractItemGroupMembers,
  collectDescendants,
  findAllowedWithBlockedParents,
  cascadeCandidates,
  applyCascade,
  describeChildSummary,
  describeTargetLabel,
} from './children.ts';
export type {
  ParentLinkRef,
  ItemGroupMemberRef,
  TargetRuleSpec,
  CascadeMode,
  BlockedParentRef,
  AllowedChildWithBlockedParent,
} from './children.ts';
