/**
 * engine/supersession/index.ts - content-supersession authoring.
 *
 * The sub-domain behind the Replace Content page: the mapping file that
 * the Content replacement module's `Renderer.supersede` reads to redirect superseded official
 * content to its homebrew replacement. All pure - the server layer supplies
 * entity bodies and the content index, the UI renders what comes back.
 *
 * Deliberately parallel to `engine/blocklist`, and deliberately separate: the
 * blocklist HIDES content, this REDIRECTS it, and conflating the two produces
 * a mapping whose target is blocked.
 */
export type {
  ReplacedByRef,
  ReviewItem,
  SupersessionRow,
  SupersessionDocument,
  EntityRef,
} from './types.ts';

export {
  toSupersessionHash,
  hashForEntity,
  packUid,
  unpackUid,
  refKey,
} from './hash.ts';

export {
  PROP_TO_PAGE,
  propToPage,
  isSupersedableProp,
  arePropsCompatible,
} from './prop-page.ts';

export { parseReplacesMarker } from './parse-marker.ts';
export type {
  MarkerTarget,
  MarkerParse,
  MarkedEntity,
} from './parse-marker.ts';

export {
  TAG_TO_PROP,
  propForTag,
  buildManualRow,
  buildRowsFromMarker,
  buildManualRows,
  SupersessionBuildError,
} from './build-row.ts';

export {
  rowKey,
  describeRow,
  parseSupersessionDocument,
  serializeSupersessionDocument,
  stringifySupersessionFile,
  emptySupersessionEnvelope,
  sortRows,
  sortReview,
  mergeRows,
  removeRow,
  removeTarget,
} from './document.ts';
export type { MergeRowsResult } from './document.ts';

export {
  groupByReplacementSet,
  groupByReplacement,
  groupRowKeys,
} from './group.ts';
export type { MappingGroup } from './group.ts';
export { diffSuggestions, suggestionId, suggestionPairKey } from './suggest.ts';
export type { Suggestion } from './suggest.ts';
export { replaceGroup, removeGroup } from './edit.ts';
export { scanMarkers } from './scan.ts';
export type { MarkerLike, ScanResult } from './scan.ts';
export {
  findDuplicates,
  unmappedDuplicates,
  duplicateId,
  duplicateRows,
} from './duplicates.ts';
export type { Duplicate, DuplicateEntity } from './duplicates.ts';
export {
  overrideId,
  isOverrideRow,
  findOverrideMatches,
  expandOverride,
  applyOverrides,
  parseOverrideRules,
  overrideConflicts,
} from './override.ts';
export type {
  OverrideRule,
  OverrideEntity,
  OverrideMatch,
  OverrideTarget,
  LoadedOverride,
} from './override.ts';
