import { fetchOk, getJson, postJson, rpc } from './transport';
import * as shops from '$lib/services/shop-service';
import type {
  OpenedShop,
  ShopListing,
  ShopSummary,
} from '$lib/services/shop-service';
import type { ShopFile } from '$lib/engine/shop-list.ts';

export type { OpenedShop, ShopListing, ShopSummary, ShopFile };

const fileUrl = (file: string) => `/api/shops/${encodeURIComponent(file)}`;

export const getShops = (): Promise<ShopListing> =>
  rpc(shops.listShops, () => getJson<ShopListing>('/api/shops'));

export const createShop = (name: string): Promise<ShopSummary> =>
  rpc(
    () => shops.createShop(name),
    () => postJson('/api/shops', { name }),
  );

export const importShop = (json: unknown, name: string): Promise<ShopSummary> =>
  rpc(
    () => shops.importShop(json, name),
    () => postJson('/api/shops', { import: json, name }),
  );

export const openShop = (file: string): Promise<OpenedShop> =>
  rpc(
    () => shops.openShop(file),
    () => getJson<OpenedShop>(fileUrl(file)),
  );

export const saveShop = (file: string, shop: ShopFile): Promise<void> =>
  rpc(
    () => shops.saveShop(file, shop),
    async () => {
      await fetchOk(fileUrl(file), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(shop),
      });
    },
  );

export const deleteShop = (file: string): Promise<void> =>
  rpc(
    () => shops.deleteShop(file),
    async () => {
      await fetchOk(fileUrl(file), { method: 'DELETE' });
    },
  );
