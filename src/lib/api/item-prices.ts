import { getJson, putJson, rpc } from './transport';
import * as prices from '$lib/services/item-prices-service';
import type { LoadedItemPrices } from '$lib/services/item-prices-service';
import type { ItemPrice } from '$lib/engine/item-prices.ts';

export type { ItemPrice, LoadedItemPrices };

export const getItemPrices = (): Promise<LoadedItemPrices> =>
  rpc(prices.loadItemPrices, () =>
    getJson<LoadedItemPrices>('/api/item-prices'),
  );

export const saveItemPrices = (
  rows: ItemPrice[],
): Promise<{ count: number; path: string }> =>
  rpc(
    () => prices.saveItemPrices(rows),
    () => putJson('/api/item-prices', { rows }),
  );

export const getItemNameSources = (): Promise<Record<string, string[]>> =>
  rpc(prices.itemNameSources, () =>
    getJson<Record<string, string[]>>('/api/item-prices/names'),
  );

export const getPriceSeedSources = (): Promise<
  { source: string; count: number }[]
> =>
  rpc(prices.seedSources, () =>
    getJson<{ source: string; count: number }[]>('/api/item-prices/seed'),
  );

export const seedItemPrices = (source: string): Promise<ItemPrice[]> =>
  rpc(
    () => prices.seedItemPrices(source),
    () =>
      getJson<ItemPrice[]>(
        `/api/item-prices/seed?source=${encodeURIComponent(source)}`,
      ),
  );
