import { fetchOk, getJson, rpc } from './transport';
import {
  listGuideEntries,
  readGuide,
  type GuideEntry,
} from '$lib/services/guide-service';

export type { GuideEntry };

export const listGuides = (): Promise<GuideEntry[]> =>
  rpc(
    listGuideEntries,
    async () => (await getJson<{ guides: GuideEntry[] }>('/api/guides')).guides,
  );

export const getGuide = (file: string): Promise<string> =>
  rpc(
    () =>
      readGuide(file).catch(() => {
        throw new Error(`Guide not found: ${file}`);
      }),
    async () =>
      (await fetchOk(`/api/guides?file=${encodeURIComponent(file)}`)).text(),
  );
