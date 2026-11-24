/**
 * engine/merge/index.ts — `_copy` inheritance resolution and blocklist filtering.
 * The sub-domain that turns raw + partial homebrew entities into fully merged ones.
 */
export {
  resolveCopy,
  resolveCopyTraced,
  getEntityKey,
  getParentKey,
  safeArithmetic,
} from './copy.ts';
export type { CopyChainLink, TracedCopy } from './copy.ts';
export {
  applyCopy,
  newTrace,
  COPY_ENTRY_PROPS,
  MERGE_REQUIRES_PRESERVE_BASE,
  MERGE_REQUIRES_PRESERVE_BY_PROP,
} from './copy-applier.ts';
export type {
  CopyTrace,
  TraceStep,
  TraceKind,
  Template,
  ApplyCopyOptions,
} from './copy-applier.ts';
export { splitByTags } from './copy-math.ts';
export { resolveVariables } from './copy-variables.ts';
export { SUPPORTED_MOD_MODES } from './copy-mods.ts';
export { expandVersions } from './copy-versions.ts';
export type { ResolvedVersion } from './copy-versions.ts';
export { buildBlocklistLookup, isBlocked } from './blocklist.ts';
export { mergeEntities } from './merge.ts';
export type { MergeInput } from './merge.ts';
