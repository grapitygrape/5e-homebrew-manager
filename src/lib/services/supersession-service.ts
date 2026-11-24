/**
 * lib/services/supersession-service.ts - the Replace Content file, and the
 * marker index behind marker scanning.
 *
 * TWO LOCATIONS, ON PURPOSE
 *   Authoring copy: `{data folder}/content/content-replacement.json`
 *   Runtime copy:   `{data root}/content-replacement.json`
 *   The Content replacement module on Customize Site copies the authoring copy in
 *   on every run: the data folder is the source of truth, the data root is a
 *   build artefact that `git clean -fd` wipes and the copy restores. Saving straight into the
 *   data root would put the file where the next update deletes it.
 *
 * WHY A SEPARATE MARKER INDEX
 *   The blocklist content index keeps identity fields only - prop, source,
 *   hash, name - which is what makes a 28 MB corpus affordable to hold. Marker
 *   scanning needs something it deliberately throws away: the first line of an
 *   entity's `entries`, where Spells That Don't Suck writes
 *   `{@b Replaces:} {@spell Shield|PHB}`. This index reads the homebrew folder
 *   (only homebrew: official content never carries a marker) and keeps the
 *   PARSED result rather than the text, so what it retains is a verdict per
 *   entity and not another copy of the corpus.
 */
import { fs, path, writeJsonWithBackup } from '$lib/fs';
import { describeRef } from '$lib/data';
import { cachedResource, getDataSource } from './datasource';
import { getContentIndex, isIndexReady } from './content-index-service';
import type { ContentIndex } from './content-index-service';
import { configProvider } from './config';
import { localDeployPath, resolveLocalDir } from './homebrew-deploy';
import {
  entityHash,
  entitySource,
  isBlockableProp,
} from '$lib/engine/blocklist';
import {
  parseReplacesMarker,
  parseSupersessionDocument,
  scanMarkers,
  findDuplicates,
  applyOverrides,
  rowKey,
  findOverrideMatches,
  isOverrideRow,
  serializeSupersessionDocument,
  stringifySupersessionFile,
} from '$lib/engine/supersession';
import type {
  Duplicate,
  DuplicateEntity,
  LoadedOverride,
  MarkerParse,
  OverrideRule,
  OverrideTarget,
  ReviewItem,
  ScanResult,
  SupersessionRow,
} from '$lib/engine/supersession';

/** Path of the authoring copy inside the data folder. */
const AUTHORING_RELATIVE = path.join('content', 'content-replacement.json');

const RUNTIME_FILENAME = 'content-replacement.json';

// --- where the files live ----------------------------------------------------

export interface SupersessionPaths {
  /** Absolute path of the authoring copy, in the data folder. */
  authoringPath: string;
  /** Absolute path of the runtime copy in the data root, or null. */
  deployPath: string | null;
}

/** Resolve both copies. The data folder is the one holding hbm-config.json. */
export function supersessionPaths(): SupersessionPaths {
  const { effectiveConfig, root } = configProvider();
  const dataPath = localDeployPath(effectiveConfig().data.path);
  const dataRoot = dataPath ? resolveLocalDir(dataPath) : null;
  return {
    authoringPath: path.join(root(), AUTHORING_RELATIVE),
    deployPath: dataRoot ? path.join(dataRoot, RUNTIME_FILENAME) : null,
  };
}

export interface ReplacementViewInfo {
  dataPath: string;
  indexWarm: boolean;
  authoringPath: string;
  deployPath: string | null;
  canDeploy: boolean;
}

/**
 * What the Replacement table and picker need before the (slow) corpus index
 * loads: where the two copies of the mapping file live, and whether we can
 * write them.
 */
export function replacementViewInfo(): ReplacementViewInfo {
  const paths = supersessionPaths();
  return {
    dataPath: describeRef(configProvider().effectiveConfig().data),
    indexWarm: isIndexReady(),
    authoringPath: paths.authoringPath,
    deployPath: paths.deployPath,
    canDeploy: paths.deployPath !== null,
  };
}

// --- the mapping file --------------------------------------------------------

export interface LoadedSupersessions {
  rows: SupersessionRow[];
  review: ReviewItem[];
  /**
   * Override rules. Their expanded rows are NOT in `rows`: the table shows a
   * rule as one line, and Save regenerates its rows from the corpus anyway.
   */
  overrides: LoadedOverride[];
  envelope: Record<string, unknown>;
  /** Rows folded into a split on read; the UI reports them. */
  duplicatesMerged: number;
  /** False when nothing has been saved yet - Save creates the file. */
  fileExists: boolean;
  authoringPath: string;
  deployPath: string | null;
  /** True when the runtime copy is already in place. */
  deployedExists: boolean;
}

/** Read the authoring copy. A missing file is an empty document, not an error. */
export async function loadSupersessions(): Promise<LoadedSupersessions> {
  const paths = supersessionPaths();
  const empty: LoadedSupersessions = {
    rows: [],
    review: [],
    overrides: [],
    envelope: {},
    duplicatesMerged: 0,
    fileExists: false,
    authoringPath: paths.authoringPath,
    deployPath: paths.deployPath,
    deployedExists: paths.deployPath
      ? await fs().exists(paths.deployPath)
      : false,
  };
  let raw: string;
  try {
    raw = await fs().readText(paths.authoringPath);
  } catch {
    return empty;
  }

  const doc = parseSupersessionDocument(JSON.parse(raw));
  // Counted from the file rather than re-matched against the corpus, so
  // opening the table never forces a cold index scan.
  const overrides: LoadedOverride[] = doc.overrides.map((rule) => {
    const keys = doc.rows
      .filter((r) => r.extra?.override === rule.id)
      .map(rowKey);
    return { ...rule, rowCount: keys.length, keys, missing: false };
  });
  return {
    ...empty,
    ...doc,
    rows: doc.rows.filter((r) => !isOverrideRow(r)),
    overrides,
    fileExists: true,
  };
}

export interface SaveInput {
  rows: SupersessionRow[];
  review: ReviewItem[];
  envelope: Record<string, unknown>;
  overrides: OverrideRule[];
}

/** Every same-named entity of `prop` outside `from`, grouped by source. */
export async function overrideTargets(
  prop: string,
  from: string,
): Promise<OverrideTarget[]> {
  const index = await getContentIndex();
  const others = [];
  for (const s of index.sources) {
    if (s.source.toLowerCase() === from.toLowerCase()) continue;
    others.push(...index.itemsFor(s.source, prop));
  }
  return findOverrideMatches(prop, from, index.itemsFor(from, prop), others);
}

/** overrideTargets, each with its source's full title, for the target picker. */
export async function namedOverrideTargets(
  prop: string,
  from: string,
): Promise<(OverrideTarget & { full: string })[]> {
  const targets = await overrideTargets(prop, from);
  const index = await getContentIndex();
  return targets.map((t) => ({
    ...t,
    full: index.summaryFor(t.source)?.full ?? t.source,
  }));
}

/** Write the authoring copy, rotating the previous file to `.bak`. */
export async function saveSupersessions(
  input: SaveInput,
): Promise<{ count: number; path: string; warnings: string[] }> {
  const paths = supersessionPaths();
  // Expand BEFORE touching the file, so a failed index build leaves the
  // previous save whole. No rules, no index: today's save cost is unchanged.
  const targetsByRule = new Map<string, OverrideTarget[]>();
  for (const rule of input.overrides)
    targetsByRule.set(rule.id, await overrideTargets(rule.prop, rule.from));
  const applied = input.overrides.length
    ? applyOverrides(input.rows, input.overrides, targetsByRule)
    : { rows: input.rows.filter((r) => !isOverrideRow(r)), warnings: [] };

  const json = serializeSupersessionDocument({
    rows: applied.rows,
    review: input.review,
    envelope: input.envelope,
    overrides: input.overrides,
  });
  await writeJsonWithBackup(
    paths.authoringPath,
    stringifySupersessionFile(json),
  );
  return {
    count: applied.rows.length,
    path: paths.authoringPath,
    warnings: applied.warnings,
  };
}

/**
 * Copy the saved authoring file into the data root, where `Renderer.supersede`
 * loads it from. Deliberately copies the file on disk rather than the working
 * state, so what you deploy is what you saved.
 */
export async function deploySupersessions(): Promise<{
  from: string;
  to: string;
}> {
  const paths = supersessionPaths();
  if (!paths.deployPath) {
    throw new Error(
      'The data source is a URL - there is no local data root to deploy into.',
    );
  }
  if (!(await fs().exists(paths.authoringPath))) {
    throw new Error('Nothing saved yet - Save creates the file first.');
  }
  await fs().mkdir(path.dirname(paths.deployPath));
  await fs().copyFile(paths.authoringPath, paths.deployPath);
  return { from: paths.authoringPath, to: paths.deployPath };
}

// --- the marker index --------------------------------------------------------

interface MarkerRecord {
  prop: string;
  source: string;
  name: string;
  hash: string;
  parse: MarkerParse;
}

interface MarkerIndex {
  /** `prop|hash` for homebrew entities only. First file wins, as elsewhere. */
  byKey: Map<string, MarkerRecord>;
  /** How many carried a usable marker, for the diagnostics line. */
  markerCount: number;
  fileCount: number;
  durationMs: number;
}

const markerKey = (prop: string, hash: string): string =>
  `${prop}|${hash.toLowerCase()}`;

async function buildMarkerIndex(): Promise<MarkerIndex> {
  const started = Date.now();
  const ds = getDataSource();
  const byKey = new Map<string, MarkerRecord>();
  let markerCount = 0;
  let fileCount = 0;

  const corpus = await ds.getHomebrewCorpus();
  if (!corpus.exists) {
    return { byKey, markerCount, fileCount, durationMs: Date.now() - started };
  }

  for (const { doc } of corpus.files) {
    if (!doc) continue;
    fileCount++;

    for (const [prop, value] of Object.entries(doc)) {
      if (!Array.isArray(value) || !isBlockableProp(prop)) continue;
      for (const raw of value) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const ent = raw as Record<string, unknown>;
        const source = entitySource(ent);
        const name = typeof ent.name === 'string' ? ent.name : '';
        if (!source || !name) continue;
        const hash = entityHash(prop, ent);
        if (!hash) continue;
        const key = markerKey(prop, hash);
        if (byKey.has(key)) continue;
        const parse = parseReplacesMarker(ent, { ownSource: source });
        if (!parse.reason) markerCount++;
        byKey.set(key, { prop, source, name, hash, parse });
      }
    }
  }

  return { byKey, markerCount, fileCount, durationMs: Date.now() - started };
}

const markerIndexCache = cachedResource(buildMarkerIndex);

/** Drop the marker index (config change, or a homebrew edit). */
export const resetSupersessionIndex = (): void => markerIndexCache.reset();

export const isMarkerIndexReady = (): boolean => markerIndexCache.isReady();

/** The marker index, building it on first use. Concurrent callers share one build. */
export const getMarkerIndex = (): Promise<MarkerIndex> =>
  markerIndexCache.get();

// --- marker scanning ---------------------------------------------------------

/**
 * Every "Replaces:" marker in the homebrew folder, as rows and review notes.
 *
 * Answers "what does the corpus claim that the file doesn't say yet?". It does
 * NOT diff against the mapping file: the page holds unsaved edits the server
 * cannot see, so the client subtracts what it already has.
 */
export async function scanAllMarkers(): Promise<
  ScanResult & { fileCount: number; duplicates: Duplicate[] }
> {
  const [markers, content] = await Promise.all([
    getMarkerIndex(),
    getContentIndex(),
  ]);
  const result = scanMarkers(
    [...markers.byKey.values()],
    (prop, name, source) =>
      Boolean(content.find(prop, entityHash(prop, { name, source }))),
  );
  return {
    ...result,
    fileCount: markers.fileCount,
    duplicates: duplicatesIn(content),
  };
}

/**
 * Homebrew sharing a name with official content, undiffed for the same
 * reason the candidates are: only the page knows its unsaved rows.
 */
function duplicatesIn(content: ContentIndex): Duplicate[] {
  const official: DuplicateEntity[] = [];
  const homebrew: DuplicateEntity[] = [];
  for (const s of content.sources) {
    const into = s.isHomebrew ? homebrew : official;
    for (const t of s.types) into.push(...content.itemsFor(s.source, t.prop));
  }
  return findDuplicates(official, homebrew);
}
