/**
 * lib/services/source-display.ts — the one resolver behind every source tag in
 * the app (see data/source-display.ts). Rebuilt when the DataSource resets, so
 * a Settings change re-reads the site, the homebrew folder and the repo.
 */
import {
  createSourceResolver,
  type SourceDisplays,
} from '$lib/data/source-display.ts';
import { cachedResource, getDataSource } from './datasource';

export type { SourceDisplays };

const resolverCache = cachedResource(() => {
  const ds = getDataSource();
  return createSourceResolver({
    readSiteFile: (rel) => ds.readSiteFile(rel),
    listHomebrew: () => ds.listHomebrew(),
    repoSourcePaths: async () => (await ds.listPartnered()).sourcePaths,
    readRepoFile: (rel) => ds.readPartnered(rel),
  });
});

export async function resolveSources(ids: string[]): Promise<SourceDisplays> {
  return (await resolverCache.get())(ids);
}
