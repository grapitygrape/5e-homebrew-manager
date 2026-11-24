import { getJson, postJson, putJson, rpc } from './transport';
import * as blocklist from '$lib/services/blocklist-service';
import * as contentIndex from '$lib/services/content-index-service';
import type {
  BlocklistViewInfo,
  LoadedBlocklist,
} from '$lib/services/blocklist-service';
import type {
  EntitySearchResult,
  SourceListing,
} from '$lib/services/content-index-service';
import type {
  AllowedChildWithBlockedParent,
  BlocklistEntry,
  IndexedEntity,
} from '$lib/engine/blocklist';

export type {
  BlocklistViewInfo,
  EntitySearchResult,
  LoadedBlocklist,
  SourceListing,
};

export const getBlocklistViewInfo = (): Promise<BlocklistViewInfo> =>
  rpc(blocklist.blocklistViewInfo, () =>
    getJson<BlocklistViewInfo>('/api/blocklist/info'),
  );

export const getBlocklist = (): Promise<LoadedBlocklist> =>
  rpc(blocklist.loadBlocklist, () =>
    getJson<LoadedBlocklist>('/api/blocklist'),
  );

export const saveBlocklist = (
  entries: BlocklistEntry[],
  envelope: Record<string, unknown>,
): Promise<{ count: number }> =>
  rpc(
    () => blocklist.saveBlocklist(entries, envelope),
    () => putJson('/api/blocklist', { entries, envelope }),
  );

export const importBlocklist = (raw: unknown): Promise<LoadedBlocklist> =>
  rpc(
    () => blocklist.diagnoseImport(raw),
    () => postJson('/api/blocklist/import', raw),
  );

export const getBlocklistSources = (refresh = false): Promise<SourceListing> =>
  rpc(
    () => contentIndex.listSources(refresh),
    () =>
      getJson<SourceListing>(
        `/api/blocklist/sources${refresh ? '?refresh=1' : ''}`,
      ),
  );

export const getSourceItems = (
  source: string,
  type: string,
): Promise<IndexedEntity[]> =>
  rpc(
    () => contentIndex.listSourceItems(source, type),
    async () =>
      (
        await getJson<{ items: IndexedEntity[] }>(
          `/api/blocklist/sources/${encodeURIComponent(source)}/items?type=${encodeURIComponent(type)}`,
        )
      ).items,
  );

export const getItemsByType = (
  type: string,
): Promise<Record<string, IndexedEntity[]>> =>
  rpc(
    () => contentIndex.listItemsByProp(type),
    async () =>
      (
        await getJson<{ bySource: Record<string, IndexedEntity[]> }>(
          `/api/blocklist/types/${encodeURIComponent(type)}/items`,
        )
      ).bySource,
  );

export const getBlocklistChildren = (
  source: string,
  type: string,
  hash: string,
): Promise<IndexedEntity[]> =>
  rpc(
    () => contentIndex.listBlocklistChildren(source, type, hash),
    async () => {
      const params = new URLSearchParams({ source, type, hash });
      return (
        await getJson<{ children: IndexedEntity[] }>(
          `/api/blocklist/children?${params}`,
        )
      ).children;
    },
  );

export const getAllowedWithBlockedParents = (
  entries: Pick<BlocklistEntry, 'hash' | 'category' | 'source'>[],
): Promise<AllowedChildWithBlockedParent[]> =>
  rpc(
    () => contentIndex.listAllowedWithBlockedParents(entries),
    async () =>
      (
        await postJson<{ items: AllowedChildWithBlockedParent[] }>(
          '/api/blocklist/orphans',
          {
            entries: entries.map((e) => ({
              hash: e.hash,
              category: e.category,
              source: e.source,
            })),
          },
        )
      ).items,
  );

export const searchBlocklistEntities = (
  query: string,
  opts: { type?: string; limit?: number } = {},
): Promise<EntitySearchResult> =>
  rpc(
    () =>
      contentIndex.searchEntities(query, {
        prop: opts.type,
        limit: opts.limit,
      }),
    () => {
      const params = new URLSearchParams({ q: query });
      if (opts.type) params.set('type', opts.type);
      if (opts.limit) params.set('limit', String(opts.limit));
      return getJson<EntitySearchResult>(`/api/blocklist/search?${params}`);
    },
  );
