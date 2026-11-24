/**
 * data/partnered.ts — finding the partnered brews in a homebrew repo checkout.
 *
 * INTENT
 *   5etools ships a set of "partnered" brews — licensed third-party books
 *   (The Lord of the Rings Roleplaying, Book of Ebon Tides, Tal'Dorei Reborn, …)
 *   that the site offers behind *Load All Partnered Content*. They are ordinary
 *   brew files living in TheGiddyLimit/homebrew, not in the user's own homebrew
 *   folder, so an index built from `data/` + `homebrew/` alone never sees them
 *   and their sources can't be selected in the Hide Content.
 *
 *   This module reads that repo's two small `_generated` indexes and answers
 *   "which files are partnered, and where are they?" — pure, so the adapter
 *   only has to supply the two parsed JSON blobs.
 *
 * THE TWO INDEXES ARE KEYED DIFFERENTLY
 *   `_generated/index-meta.json`     BASENAME → { n, a, e, p }
 *   `_generated/index-sources.json`  SOURCE CODE → repo-relative path
 *
 *   `p` is the partnered flag — the same one 5etools reads in
 *   `utils-brew-base.js` (`out._brewIsPartnered = !!metaIndex[out.name]?.p`).
 *   Meta's `a` is the *abbreviation* (`BoET`), which is NOT what entities carry:
 *   their `source` is the `json` code (`BookOfEbonTides`), and that is what the
 *   blocklist is written against. The source index is keyed by exactly that
 *   code, so inverting it gives both the path and the codes in one step — and
 *   lets a caller skip a file it already has locally without parsing 45 MB of
 *   brew to find out.
 */
import { stringList } from '../util.ts';

/** Display metadata from `_generated/index-meta.json` for one repo file. */
export interface RepoFileMeta {
  /** Full source names (`n`). */
  names: string[];
  /** Source abbreviations (`a`). */
  abbreviations: string[];
}

/** Extract `names` and `abbreviations` per basename from `_generated/index-meta.json`. */
export function parsePartneredMeta(
  indexMeta: Record<string, unknown>,
): Record<string, RepoFileMeta> {
  const out: Record<string, RepoFileMeta> = {};
  for (const [file, entry] of Object.entries(indexMeta)) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as { n?: unknown; a?: unknown };
    out[file] = {
      names: stringList(rec.n),
      abbreviations: stringList(rec.a),
    };
  }
  return out;
}

/** One partnered brew file, located and identified. */
export interface PartneredFileMeta {
  /** Path relative to the repo root, forward-slashed. */
  path: string;
  /** Basename — the key `index-meta.json` uses. */
  file: string;
  /** Source `json` codes the file declares; what entities carry as `source`. */
  sources: string[];
}

/** The partnered flag as `index-meta.json` records it (`1`, or absent). */
export function isPartneredEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  return !!(entry as { p?: unknown }).p;
}

/**
 * The partnered brews of a homebrew repo, from its two `_generated` indexes.
 *
 * An entry no source index can place is dropped rather than guessed at: without
 * a path there is nothing to read, and without source codes a caller can't tell
 * whether it already has the brew.
 */
export function selectPartneredFiles(
  indexMeta: Record<string, unknown>,
  indexSources: Record<string, unknown>,
): PartneredFileMeta[] {
  // path → source codes, and basename → path, from one pass over the source index.
  const byPath = new Map<string, string[]>();
  const pathOfFile = new Map<string, string>();
  for (const [code, rawPath] of Object.entries(indexSources)) {
    if (typeof rawPath !== 'string' || !rawPath) continue;
    const path = rawPath.replace(/\\/g, '/');
    const codes = byPath.get(path);
    if (codes) codes.push(code);
    else byPath.set(path, [code]);
    pathOfFile.set(path.slice(path.lastIndexOf('/') + 1), path);
  }

  const out: PartneredFileMeta[] = [];
  for (const [file, entry] of Object.entries(indexMeta)) {
    if (!isPartneredEntry(entry)) continue;
    const path = pathOfFile.get(file);
    if (!path) continue;
    const sources = byPath.get(path);
    if (!sources?.length) continue;
    out.push({ path, file, sources: [...sources] });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** One brew a local file depends on, located in the homebrew repo. */
export interface DependencyFile {
  /** Path relative to the repo root, forward-slashed. */
  path: string;
  /** The needed source codes this file declares. */
  sources: string[];
}

/**
 * Source codes one brew's `_meta` pulls in. 5etools loads `dependencies` and
 * `includes` the same way - the whole named file - so both count.
 */
export function collectDependencyCodes(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const out = new Set<string>();
  for (const key of ['dependencies', 'includes']) {
    const block = (meta as Record<string, unknown>)[key];
    if (!block || typeof block !== 'object') continue;
    for (const list of Object.values(block as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      for (const code of list)
        if (typeof code === 'string' && code) out.add(code);
    }
  }
  return [...out];
}

/**
 * Resolve dependency codes to repo files via `index-sources.json`. A code the
 * user's own folder already provides is skipped - their copy wins, as with
 * partnered brews - and a file declaring several needed codes is read once.
 */
export function selectDependencyFiles(
  codes: Iterable<string>,
  sourcePaths: Record<string, string>,
  alreadyHave: (code: string) => boolean,
): { files: DependencyFile[]; unresolved: string[] } {
  const byPath = new Map<string, Set<string>>();
  const unresolved: string[] = [];
  for (const code of codes) {
    if (alreadyHave(code)) continue;
    const raw = sourcePaths[code];
    if (typeof raw !== 'string' || !raw) {
      unresolved.push(code);
      continue;
    }
    const path = raw.replace(/\\/g, '/');
    const set = byPath.get(path) ?? new Set<string>();
    set.add(code);
    byPath.set(path, set);
  }
  const files = [...byPath.entries()]
    .map(([path, set]) => ({ path, sources: [...set].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
  return { files, unresolved: unresolved.sort() };
}
