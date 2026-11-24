/**
 * data/index.ts — public barrel + the createDataSource() factory.
 *
 * INTENT
 *   Construct the FsDataSource adapter (filesystem + fetch) from one call.
 *   Callers depend only on the DataSource interface.
 */
import type { DataSource, DataSourceConfig } from './source.ts';
import { FsDataSource } from './fs-source.ts';

export * from './source.ts';
export { FsDataSource } from './fs-source.ts';
export {
  DEFAULT_CONFIG,
  loadConfig,
  describeRef,
  isAllUrls,
  parseSourceInput,
} from './config.ts';
export {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  parseUrlList,
  trimBaseUrl,
  resolveStoredConfig,
  resolveStoredAppSettings,
  mergeStoredConfig,
  serializeStoredConfig,
} from './config.ts';
export type {
  AppSettings,
  StoredConfig,
  SourceRepo,
  SourceRepoId,
  SourceRepos,
} from './config.ts';
export {
  selectPartneredFiles,
  parsePartneredMeta,
  isPartneredEntry,
  collectDependencyCodes,
  selectDependencyFiles,
} from './partnered.ts';
export type {
  PartneredFileMeta,
  RepoFileMeta,
  DependencyFile,
} from './partnered.ts';

export interface CreateOpts {
  /** Filesystem root for resolving relative paths. */
  root?: string;
}

/** Construct the DataSource adapter for the given config. */
export function createDataSource(
  cfg: DataSourceConfig,
  opts: CreateOpts = {},
): DataSource {
  return new FsDataSource(cfg, opts.root);
}
export {
  SOURCE_REPOS,
  defaultRepoFolders,
  derivedSources,
  legacyRepoPaths,
  toolsRepoPath,
  commonParent,
  siteHomebrewFolders,
  withoutPaths,
} from './source-repos.ts';
export type { SourceRepoInfo } from './source-repos.ts';
