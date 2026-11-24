/**
 * data/source-repos.ts — the git repos setup clones, and how the app's
 * sources follow from where they sit.
 *
 * INTENT
 *   Setup and Settings both edit repos, not raw source paths, so this is the
 *   one place that knows the layout inside each repo (`data/`, `homebrew/`,
 *   `schema/brew`) and the default folder names under a chosen parent.
 */
import { basename, dirname, join, normalize } from '../fs/path.ts';
import type { DataSourceConfig } from './source.ts';
import type { SourceRepoId, SourceRepos } from './config.ts';

export interface SourceRepoInfo {
  id: SourceRepoId;
  label: string;
  required: boolean;
  /** Hint text for the URL field; there are no default URLs. */
  hint: string;
  /** Default folder under the parent. Images sit inside the tools folder so the local site serves them. */
  folder: string;
  /** Shown under the folder while it's still empty or missing. */
  description?: string;
}

/** The folder the defaults gather the repos in, under the chosen parent. */
const DATA_FOLDER = '5e-data';

export const SOURCE_REPOS: readonly SourceRepoInfo[] = [
  {
    id: 'tools',
    label: 'Tools source',
    required: true,
    hint: 'https://github.com/…/tools',
    folder: '5e',
  },
  {
    id: 'siteImages',
    label: 'Images source',
    required: false,
    hint: 'https://github.com/…/images',
    folder: '5e/img',
    description: 'If added, where the images will be stored.',
  },
  {
    id: 'homebrew',
    label: 'Homebrew files',
    required: true,
    hint: 'https://github.com/…/homebrew',
    folder: 'homebrew',
    description: 'If added, where the staging homebrew will be stored.',
  },
  {
    id: 'images',
    label: 'Homebrew images',
    required: false,
    hint: 'https://github.com/…/homebrew-img',
    folder: '5e/homebrew-img',
    description: 'If added, where the homebrew images will be stored.',
  },
  {
    id: 'utils',
    label: 'Homebrew utilities',
    required: true,
    hint: 'https://github.com/…/utilities',
    folder: 'utils',
  },
  // The bridge module ships inside this repo (foundry-homebrew-bridge/), so it has
  // no repo row for now. See services/bridge-deploy.ts.
  // {
  //   id: 'bridge',
  //   label: 'Foundry bridge',
  //   required: false,
  //   hint: 'https://github.com/…/foundry-homebrew-bridge',
  //   folder: 'foundry-homebrew-bridge',
  //   description:
  //     'If added, the Foundry module deployed into the Foundry Data folder.',
  // },
];

/** `<parent>/5e-data/<folder>`, or `<parent>/<folder>` when the parent already is 5e-data. */
export function defaultRepoFolders(
  parent: string,
): Record<SourceRepoId, string> {
  const base =
    basename(parent).toLowerCase() === DATA_FOLDER
      ? parent
      : join(parent, DATA_FOLDER);
  const out = {} as Record<SourceRepoId, string>;
  for (const r of SOURCE_REPOS) out[r.id] = join(base, r.folder);
  return out;
}

/** The sources each repo folder feeds. Repos without a folder feed nothing. */
export function derivedSources(repos: SourceRepos): Partial<DataSourceConfig> {
  const dir = (id: SourceRepoId) => repos[id]?.path.trim() ?? '';
  const out: Partial<DataSourceConfig> = {};
  const tools = dir('tools');
  if (tools) {
    out.data = { path: join(tools, 'data') };
    out.homebrew = { path: join(tools, 'homebrew') };
  }
  const utils = dir('utils');
  if (utils) out.schema = { path: join(utils, 'schema/brew') };
  const homebrew = dir('homebrew');
  if (homebrew) out.partnered = { path: homebrew };
  return out;
}

/** Repo folders implied by a config written before `sourceRepos` existed. */
export function legacyRepoPaths(
  cfg: DataSourceConfig,
): Record<SourceRepoId, string> {
  const tools = cfg.data.path ? dirname(cfg.data.path) : '';
  return {
    tools,
    siteImages: tools ? join(tools, 'img') : '',
    homebrew: cfg.partnered?.path ?? '',
    images: tools ? join(tools, 'homebrew-img') : '',
    utils: cfg.schema.path ? dirname(dirname(cfg.schema.path)) : '',
    // bridge: '',
  };
}

/**
 * The Tools source checkout: its repo path, else the folder above `data/`
 * (as the Rust side resolves it). Empty when neither is set.
 */
export function toolsRepoPath(
  repos: SourceRepos | undefined,
  cfg: DataSourceConfig,
): string {
  return repos?.tools?.path.trim() || legacyRepoPaths(cfg).tools;
}

/** The deepest folder that strictly contains every non-empty path. */
export function commonParent(paths: string[]): string {
  const split = paths
    .filter((p) => p.trim())
    .map((p) => normalize(p).split('/').filter(Boolean));
  if (!split.length) return '';
  // Strictly above the shortest path, so a repo folder is never its own parent.
  const limit = Math.min(...split.map((s) => s.length)) - 1;
  let depth = 0;
  while (
    depth < limit &&
    split.every((s) => s[depth].toLowerCase() === split[0][depth].toLowerCase())
  )
    depth++;
  return split[0].slice(0, depth).join('/');
}

/** Each site folder's own `homebrew/`, which deploys always include. */
export function siteHomebrewFolders(siteFolders: string[]): string[] {
  return siteFolders
    .filter((p) => p.trim())
    .map((p) => join(p.trim(), 'homebrew'));
}

/** Windows paths match regardless of case or slash direction. */
const pathKey = (p: string) => normalize(p.trim()).toLowerCase();

/** `list` minus anything naming a folder in `remove`, keeping the original text. */
export function withoutPaths(list: string[], remove: string[]): string[] {
  const drop = new Set(remove.map(pathKey));
  return list.filter((p) => !drop.has(pathKey(p)));
}
