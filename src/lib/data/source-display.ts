/**
 * data/source-display.ts — how any source id should look, app-wide: the
 * abbreviation and colour 5etools shows for it (XPHB → PHB'24, SpellsThatDontSuck
 * → SDS), whatever kind of source it is.
 *
 * WHERE EACH KIND LIVES, IN THE ORDER IT WINS
 *   1. Local brews     `_meta.sources` of the files in the homebrew folder.
 *   2. Official books  the site's `js/parser.js` + `css/main.css` (core-sources.ts).
 *   3. The brew repo   partnered books, dependencies, anything else the
 *                      homebrew repo checkout indexes in `index-sources.json`.
 *
 * Repo files are big (Crooked Moon alone is 4 MB) and there are hundreds, so
 * they are read only for ids the first two didn't answer, one read per file,
 * and kept. Pure apart from the injected I/O, so it runs on the Node server and
 * in the Tauri webview alike.
 */
import { parseCoreSources } from './core-sources.ts';
import { metaSources } from './homebrew-meta.ts';
import type { HomebrewListing, SourceDisplay } from './source.ts';

export interface SourceDisplayIo {
  /** A text file beside `data/` (DataSource.readSiteFile). */
  readSiteFile(relPath: string): Promise<string | null>;
  listHomebrew(): Promise<HomebrewListing>;
  /** The repo's source id → repo-relative path; `{}` when unconfigured. */
  repoSourcePaths(): Promise<Record<string, string>>;
  readRepoFile(relPath: string): Promise<Record<string, unknown> | null>;
}

/** Lowercased id → how it looks; null when nothing declares it. */
export type SourceDisplays = Record<string, SourceDisplay | null>;

/**
 * Local brews change while the app runs (Files' Add and Remove), so a miss
 * re-reads the folder once the snapshot is older than this.
 */
const LOCAL_MAX_AGE_MS = 60_000;

const swallow = <T>(work: Promise<T>, fallback: T): Promise<T> =>
  work.catch(() => fallback);

export function createSourceResolver(
  io: SourceDisplayIo,
): (ids: string[]) => Promise<SourceDisplays> {
  let core: Promise<Map<string, SourceDisplay>> | null = null;
  let local: { at: number; ix: Promise<Map<string, SourceDisplay>> } | null =
    null;
  let repoPaths: Promise<Map<string, string>> | null = null;
  const repoFiles = new Map<string, Promise<SourceDisplay[]>>();

  const loadCore = () =>
    (core ??= Promise.all([
      swallow(io.readSiteFile('js/parser.js'), null),
      swallow(io.readSiteFile('css/main.css'), null),
    ]).then(([js, css]) => parseCoreSources(js ?? '', css ?? '')));

  const loadLocal = (refresh: boolean) => {
    if (!local || (refresh && Date.now() - local.at > LOCAL_MAX_AGE_MS)) {
      local = {
        at: Date.now(),
        ix: swallow(io.listHomebrew(), null).then((listing) => {
          const ix = new Map<string, SourceDisplay>();
          for (const f of listing?.files ?? [])
            for (const s of f.sources) ix.set(s.json.toLowerCase(), s);
          return ix;
        }),
      };
    }
    return local.ix;
  };

  const loadRepoPaths = () =>
    (repoPaths ??= swallow(io.repoSourcePaths(), {}).then(
      (paths) =>
        new Map(Object.entries(paths).map(([id, p]) => [id.toLowerCase(), p])),
    ));

  const readRepo = (relPath: string) => {
    let hit = repoFiles.get(relPath);
    if (!hit) {
      hit = swallow(io.readRepoFile(relPath), null).then((json) =>
        json ? metaSources(json) : [],
      );
      repoFiles.set(relPath, hit);
    }
    return hit;
  };

  /** Local, then official; the ids neither knows are left for the repo. */
  const fromFolders = async (keys: string[], refresh: boolean) => {
    const [localIx, coreIx] = await Promise.all([
      loadLocal(refresh),
      loadCore(),
    ]);
    return new Map(
      keys.map((k) => [k, localIx.get(k) ?? coreIx.get(k) ?? null] as const),
    );
  };

  return async (ids) => {
    const keys = [...new Set(ids.map((id) => id.toLowerCase()))];
    let found = await fromFolders(keys, false);
    if ([...found.values()].includes(null))
      found = await fromFolders(keys, true);

    const missing = keys.filter((k) => !found.get(k));
    if (missing.length) {
      const paths = await loadRepoPaths();
      await Promise.all(
        missing.map(async (k) => {
          const path = paths.get(k);
          if (!path) return;
          const sources = await readRepo(path);
          found.set(k, sources.find((s) => s.json.toLowerCase() === k) ?? null);
        }),
      );
    }
    return Object.fromEntries(found);
  };
}
