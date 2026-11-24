/**
 * lib/services/shop-service.ts - Shops > Lists: the shop files in
 * `{data folder}/content/shops/`, and what their entries resolve to.
 *
 * The site browser adds to the same files from Rust (`src-tauri/src/shops.rs`),
 * so a shop is read fresh on every open rather than cached.
 */
import { fs, path } from '$lib/fs';
import { composeItemCatalog, composeMerged } from '$lib/data';
import { buildItemIndex, resolveItemList } from '$lib/engine';
import type { Entity, ResolvedShopList } from '$lib/engine';
import {
  emptyShop,
  isShopFileName,
  isSpellEntry,
  normalizeShopListImport,
  parseShopFile,
  shopFileName,
  stringifyShopFile,
  type ShopFile,
} from '$lib/engine/shop-list.ts';
import { cachedResource, getDataSource } from './datasource';
import { configProvider } from './config';
import { mapPool } from '$lib/util';

export const shopsDir = (): string =>
  path.join(configProvider().root(), 'content', 'shops');

export interface ShopSummary {
  file: string;
  name: string;
  /** Distinct entries, not the sum of their counts. */
  count: number;
  error: string | null;
}

export interface ShopListing {
  path: string;
  shops: ShopSummary[];
}

export interface OpenedShop extends ResolvedShopList {
  file: string;
  shop: ShopFile;
}

function shopPath(file: string): string {
  if (!isShopFileName(file)) throw new Error(`Not a shop file name: ${file}`);
  return path.join(shopsDir(), file);
}

const fallbackName = (file: string): string => file.replace(/\.json$/i, '');

async function readShopFile(file: string): Promise<ShopFile> {
  const raw = await fs().readText(shopPath(file));
  return parseShopFile(JSON.parse(raw.replace(/^﻿/, '')), fallbackName(file));
}

async function shopFiles(): Promise<string[]> {
  try {
    return (await fs().readDir(shopsDir()))
      .filter((e) => e.isFile && isShopFileName(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export async function listShops(): Promise<ShopListing> {
  const files = await shopFiles();
  const shops = await mapPool(files, async (file): Promise<ShopSummary> => {
    try {
      const shop = await readShopFile(file);
      return { file, name: shop.name, count: shop.items.length, error: null };
    } catch (e) {
      return {
        file,
        name: fallbackName(file),
        count: 0,
        error: (e as Error).message,
      };
    }
  });
  shops.sort((a, b) => a.name.localeCompare(b.name));
  return { path: shopsDir(), shops };
}

// Spells hash the same way items do (name_source), so buildItemIndex serves both.
const itemIndexCache = cachedResource(() =>
  composeItemCatalog(getDataSource()).then(buildItemIndex),
);
const spellIndexCache = cachedResource(() =>
  composeMerged(getDataSource(), 'spell').then(buildItemIndex),
);

const itemIndex = (): Promise<Map<string, Entity>> => itemIndexCache.get();
const spellIndex = (): Promise<Map<string, Entity>> => spellIndexCache.get();

/** A shop with each entry resolved against the item catalog. */
export async function openShop(file: string): Promise<OpenedShop> {
  const shop = await readShopFile(file);
  const hasSpells = shop.items.some(isSpellEntry);
  const [index, blocklist, spells] = await Promise.all([
    itemIndex(),
    getDataSource().getBlocklist(),
    hasSpells ? spellIndex() : undefined,
  ]);
  return {
    file,
    shop,
    ...resolveItemList(shop.items, index, blocklist, spells),
  };
}

/** Write a shop, keeping the previous file as `.bak`. */
export async function saveShop(file: string, shop: ShopFile): Promise<void> {
  const target = shopPath(file);
  const clean = parseShopFile(shop, fallbackName(file));
  await fs().mkdir(shopsDir());
  try {
    await fs().copyFile(target, `${target}.bak`);
  } catch {
    /* nothing to back up yet */
  }
  await fs().writeText(target, stringifyShopFile(clean));
}

async function createFrom(shop: ShopFile): Promise<ShopSummary> {
  const file = shopFileName(shop.name, await shopFiles());
  await saveShop(file, shop);
  return { file, name: shop.name, count: shop.items.length, error: null };
}

export async function createShop(name: string): Promise<ShopSummary> {
  if (!name.trim()) throw new Error('A shop needs a name.');
  return createFrom(emptyShop(name));
}

/** A 5etools "Export list" file as a new shop. */
export async function importShop(
  json: unknown,
  fallback: string,
): Promise<ShopSummary> {
  return createFrom(normalizeShopListImport(json, fallback));
}

/** Rename the file to `.bak`, which the listing skips, so a delete can be undone by hand. */
export async function deleteShop(file: string): Promise<void> {
  const target = shopPath(file);
  await fs().rename(target, `${target}.bak`);
}
