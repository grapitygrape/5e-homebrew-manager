/**
 * lib/services/content-index-scan.ts — one full pass over the corpus behind
 * the content index: official data, the homebrew folder, the brews those
 * depend on, and partnered books, in that order. Order matters: the first
 * copy of a source wins, so the user's own brew beats the repo's.
 */
import { mapPool } from '$lib/util';
import type { DataSource } from '$lib/data';
import { collectDependencyCodes, selectDependencyFiles } from '$lib/data';
import {
  ingestFile,
  ingestRaces,
  newAccumulator,
  recordHomebrewMeta,
  recordTitles,
  summarizeSources,
} from './content-index-accumulator';
import { buildChildrenGraph } from './content-index-graph';
import type { HydratedIndexData } from './content-index-cache';

/** Read and index every file. `dataFiles` is the already-filtered official list. */
export async function scanCorpus(
  ds: DataSource,
  dataFiles: string[],
): Promise<HydratedIndexData> {
  const acc = newAccumulator();
  const skipped: string[] = [];
  let fileCount = 0;

  // --- official data -------------------------------------------------------
  const loadedDataFiles = await ds.readDataFiles(dataFiles);
  for (let i = 0; i < dataFiles.length; i++) {
    const json = loadedDataFiles[i];
    if (!json) {
      skipped.push(dataFiles[i]);
      continue;
    }
    fileCount++;
    recordTitles(acc, json);
    ingestFile(acc, json);
  }

  // --- homebrew ------------------------------------------------------------
  const dependencyCodes = new Set<string>();
  const corpus = await ds.getHomebrewCorpus();
  if (corpus.exists) {
    for (const { file, doc } of corpus.files) {
      if (!doc) {
        skipped.push(file);
        continue;
      }
      fileCount++;
      recordHomebrewMeta(acc, doc);
      recordTitles(acc, doc);
      ingestFile(acc, doc);
      for (const code of collectDependencyCodes(doc._meta))
        dependencyCodes.add(code);
    }
  }

  // --- partnered brews -----------------------------------------------------
  // 5etools' licensed third-party books. They live in a homebrew-repo checkout,
  // not the user's homebrew folder, so without this pass their sources (TLotRR,
  // BookOfEbonTides, …) are simply absent from the picker even though the site
  // offers them behind "Load All Partnered Content".
  //
  // A file whose sources are ALREADY indexed is skipped outright — the user's
  // own copy wins, and skipping before the read saves parsing a brew we would
  // only throw away. That check is why listPartnered() reports source codes.
  const partnered = await ds.listPartnered();
  const alreadyHave = (code: string): boolean => {
    const key = code.toLowerCase();
    // `homebrewSources` is the precise test — it holds every source a brew
    // DECLARED, including one that contributed no blockable entities and so
    // never reached `bySource`. `bySource` covers the official corpus too.
    return acc.homebrewSources.has(key) || acc.bySource.has(key);
  };

  // --- dependencies --------------------------------------------------------
  // A brew's `_meta.dependencies` makes 5etools load the WHOLE named file, so
  // every entity in it is live on the site. Index them too, or the
  // Replacement picker can't see what it needs to override. 5etools follows
  // them transitively (utils-brew-base.js `_pGetBrewDependencies_`), so each
  // file read here can add more codes. The first pass runs before the
  // partnered loop so a partnered file pulled in this way is tagged by why
  // it's loaded, and `alreadyHave` stops the partnered loop reading it twice.
  const unresolvedDeps = new Set<string>();
  // Codes already tried, so a cycle through a file that doesn't declare the
  // code it was found under can't loop forever.
  const triedDeps = new Set<string>();
  const loadDependencies = async (codes: Iterable<string>): Promise<void> => {
    let pending = [...codes];
    while (pending.length) {
      pending = pending.filter((code) => !triedDeps.has(code));
      for (const code of pending) triedDeps.add(code);
      const deps = selectDependencyFiles(
        pending,
        partnered.sourcePaths,
        alreadyHave,
      );
      for (const code of deps.unresolved) unresolvedDeps.add(code);
      pending = [];
      const loadedDeps = await mapPool(deps.files, (file) =>
        ds.readPartnered(file.path).catch(() => null),
      );
      for (let i = 0; i < deps.files.length; i++) {
        const file = deps.files[i];
        const json = loadedDeps[i];
        if (!json) {
          skipped.push(file.path);
          continue;
        }
        fileCount++;
        for (const key of recordHomebrewMeta(acc, json))
          acc.dependencySources.add(key);
        recordTitles(acc, json);
        ingestFile(acc, json);
        pending.push(...collectDependencyCodes(json._meta));
      }
    }
  };
  await loadDependencies(dependencyCodes);

  const partneredDependencyCodes = new Set<string>();
  const plannedPartnered = new Set<string>();
  const partneredToLoad = partnered.files.filter((meta) => {
    if (
      meta.sources.some(
        (code) => alreadyHave(code) || plannedPartnered.has(code.toLowerCase()),
      )
    ) {
      return false;
    }
    for (const code of meta.sources) plannedPartnered.add(code.toLowerCase());
    return true;
  });
  const loadedPartnered = await mapPool(partneredToLoad, (meta) =>
    ds.readPartnered(meta.path).catch(() => null),
  );
  for (let i = 0; i < partneredToLoad.length; i++) {
    const meta = partneredToLoad[i];
    if (meta.sources.some(alreadyHave)) continue;
    const json = loadedPartnered[i];
    if (!json) {
      skipped.push(meta.path);
      continue;
    }
    fileCount++;
    for (const key of recordHomebrewMeta(acc, json))
      acc.partneredSources.add(key);
    recordTitles(acc, json);
    ingestFile(acc, json);
    for (const code of collectDependencyCodes(json._meta))
      partneredDependencyCodes.add(code);
  }
  // Partnered books pull in their own dependencies (Grim Hollow's Campaign
  // Guide 2024 needs the non-partnered Monster Grimoire 2024).
  await loadDependencies(partneredDependencyCodes);
  for (const code of [...unresolvedDeps].sort())
    skipped.push(`dependency ${code}`);

  const raceResult = ingestRaces(acc);
  const { childrenByParent, parents } = buildChildrenGraph(acc, raceResult);

  return {
    sources: summarizeSources(acc),
    bySource: acc.bySource,
    byPropHash: acc.byPropHash,
    childrenByParent,
    parents,
    entityCount: acc.count,
    duplicateEntities: acc.duplicateEntities,
    fileCount,
    builtAt: Date.now(),
    skipped,
  };
}
