/**
 * engine/audit/index.ts — the schema / validation / guide-audit / homebrew-parse
 * sub-domain. Answers "is this homebrew valid against its type's schema, and how
 * well does a conversion guide cover that schema?" Pure, I/O-free.
 */
export {
  resolveRef,
  describeProperty,
  collectTopLevelProperties,
  getEntityProperties,
  getEntityBranches,
  getRelatedKeys,
} from './schema.ts';
export type {
  SchemaMap,
  PropertyInfo,
  RefInfo,
  NamedProperty,
  SchemaBranch,
} from './schema.ts';
export {
  auditGuide,
  auditGuideBranched,
  extractGuideKeys,
  toSummary,
  aggregateAudit,
} from './audit.ts';
export type {
  GuideAuditResult,
  AuditSummaryRow,
  AuditGuideInput,
  AuditAggregate,
  BranchAuditResult,
  AuditGuideBranchedInput,
  BranchedGuideAudit,
} from './audit.ts';
export {
  GUIDE_MAP,
  DOC_MAP,
  ARRAY_PROP_TO_GUIDE,
  docGroupFor,
  unmappedGuides,
} from './guide-map.ts';
export type {
  GuideMapEntry,
  GuideSchemaRef,
  DocMapEntry,
} from './guide-map.ts';
export { buildFixPrompt, describeFixPrompt } from './fix-prompt.ts';
export type {
  FixPrompt,
  FixPromptInput,
  FixPromptEntityIssues,
} from './fix-prompt.ts';
export { buildConvertPrompt } from './convert-prompt.ts';
export type {
  ConvertPromptInput,
  ConvertPromptPaths,
} from './convert-prompt.ts';
export { parseModelReply, mergeIntoBrew, describeMerge } from './brew-merge.ts';
export type {
  ModelReply,
  MergeChange,
  MergedEntity,
  MergeResult,
} from './brew-merge.ts';
export { buildNewSource, NEW_SOURCE_ID } from './new-source.ts';
export { buildGuideSchema, buildAllGuideSchemas } from './guide-schema.ts';
export type { GuideSchema } from './guide-schema.ts';
export {
  buildTypeSchema,
  resolveTypeItemSchema,
  entityTypeFor,
  typeLabelFor,
} from './type-schema.ts';
export type { TypeSchema } from './type-schema.ts';
export {
  validateEntity,
  withNameSet,
  BARE_SCHEMA,
  TYPE_RELATIONSHIPS,
  VALIDATOR_SAMPLES,
} from './validate.ts';
export type {
  EntitySchema,
  SchemaProperty,
  TypeRelationship,
} from './validate.ts';
export {
  createSchemaValidator,
  documentKind,
  BREW_ROOT,
  ENTRY_ROOT,
} from './schema-validate.ts';
export type { SchemaValidator, DocumentKind } from './schema-validate.ts';
export { issueLocation, formatPath, pointerLabel } from './schema-messages.ts';
export type { SchemaIssue } from './schema-messages.ts';
export { createSchemaIndex, locId } from './schema-shape.ts';
export type { SchemaIndex, SchemaLoc, ObjectShape } from './schema-shape.ts';
export {
  resolvePath,
  expand as expandSchema,
  propertyOptions,
  valueOptions,
  snippetOptions,
} from './schema-complete.ts';
export type {
  PathSeg,
  PropertyOption,
  ValueOption,
  SnippetOption,
} from './schema-complete.ts';
export { locatePointers } from './json-locate.ts';
export type { PointerSpan } from './json-locate.ts';
export {
  parseHomebrewFile,
  findEntityEnd,
  extractPropName,
  buildEntityPositions,
  scanTopLevel,
} from './homebrew-parse.ts';
export type {
  ParsedNode,
  ParsedHomebrew,
  ParseTotals,
  EntityPosition,
  TextSpan,
  TopLevelValue,
  TopLevelScan,
} from './homebrew-parse.ts';
export { extractEntityRefs, TAG_TARGETS } from './link-extract.ts';
export type { ContentRef, RefKind } from './link-extract.ts';
export {
  createLinkIndex,
  indexEntity,
  indexHomebrewMeta,
  indexSpecificVariants,
  indexSourceEditions,
  buildLocalIndex,
  BUILTIN_OFFICIAL_SOURCES,
} from './link-index.ts';
export type { LinkIndex } from './link-index.ts';
export {
  docEdition,
  checkRef,
  checkEntity,
  issuesByRaw,
  applyLinkChecks,
} from './link-check.ts';
export type {
  LinkIssue,
  NodeLinkIssues,
  LinkCheckResult,
  LinkContext,
} from './link-check.ts';
export { readSiteSources } from './site-sources.ts';
export type { SiteSources } from './site-sources.ts';
export {
  findCollisions,
  collisionsForFile,
  collisionKey,
  buildOfficialKeys,
} from './collisions.ts';
export type {
  Collision,
  CollisionKind,
  CollisionInput,
  CollisionReport,
} from './collisions.ts';
export { lintSubmission } from './submission-lint.ts';
export type { LintIssue, LintInput, LintReport } from './submission-lint.ts';
export { regenerateGuideLists, renderEnum, ENUMS } from './guide-enums.ts';
export type { GuideListsResult } from './guide-enums.ts';
