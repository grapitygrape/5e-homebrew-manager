/**
 * lib/services/item-prices-service.ts - Shops > Prices: the price list file,
 * what its rows match, and seeding from a homebrew source.
 *
 * ONE COPY
 *   `{data folder}/content/item-prices.json` is read where it is by the Item
 *   prices deploy module (Prepare) and by homebrew deploy, so unlike Replace
 *   Content there is no runtime copy to keep in step.
 */
import { fs, path, writeJsonWithBackup } from '$lib/fs';
import { composeItemCatalog } from '$lib/data';
import {
  parsePriceFile,
  seedPrices,
  stringifyPriceFile,
} from '$lib/engine/item-prices.ts';
import type { ItemPrice } from '$lib/engine/item-prices.ts';
import type { Entity } from '$lib/engine';
import { cachedResource, getDataSource } from './datasource';
import { configProvider } from './config';

const RELATIVE = path.join('content', 'item-prices.json');

export const itemPricesPath = (): string =>
  path.join(configProvider().root(), RELATIVE);

export interface LoadedItemPrices {
  rows: ItemPrice[];
  path: string;
  fileExists: boolean;
}

export async function loadItemPrices(): Promise<LoadedItemPrices> {
  const file = itemPricesPath();
  let raw: string;
  try {
    raw = await fs().readText(file);
  } catch {
    return { rows: [], path: file, fileExists: false };
  }
  return {
    rows: parsePriceFile(JSON.parse(raw.replace(/^\uFEFF/, ''))),
    path: file,
    fileExists: true,
  };
}

/** Write the list, rotating the previous file to `.bak` first. */
export async function saveItemPrices(
  rows: ItemPrice[],
): Promise<{ count: number; path: string }> {
  const file = itemPricesPath();
  // Same cleanup as a load, so the file never holds a row the deploy would skip.
  const clean = parsePriceFile({ prices: rows });
  await writeJsonWithBackup(file, stringifyPriceFile(clean));
  return { count: clean.length, path: file };
}

const itemNameSourcesCache = cachedResource<Record<string, string[]>>(
  async () => {
    const out: Record<string, string[]> = {};
    for (const e of await composeItemCatalog(getDataSource())) {
      if (typeof e.name !== 'string' || typeof e.source !== 'string') continue;
      const list = (out[e.name.toLowerCase()] ??= []);
      if (!list.includes(e.source)) list.push(e.source);
    }
    return out;
  },
);

export const resetItemNameSources = (): void => itemNameSourcesCache.reset();

/**
 * Every item name the site can show (lower-cased) with the sources it comes
 * in. The page works out each row's matches from this, so editing a row
 * never goes back to the server.
 */
export const itemNameSources = (
  force = false,
): Promise<Record<string, string[]>> => itemNameSourcesCache.get(force);

const variantSource = (e: Entity): string | undefined => {
  const inh = e.inherits as Record<string, unknown> | undefined;
  return typeof e.source === 'string'
    ? e.source
    : typeof inh?.source === 'string'
      ? inh.source
      : undefined;
};

/** Raw homebrew items and variants, blocklisted or not: a seed source is often hidden. */
async function homebrewPriced(): Promise<Entity[]> {
  const ds = getDataSource();
  const groups = (
    await Promise.all(
      ['item', 'baseitem', 'itemGroup', 'magicvariant'].map((k) =>
        ds.getHomebrew(k),
      ),
    )
  ).flat();
  return groups.flatMap((g) => g.entities);
}

/** Homebrew sources that carry item values, with how many, for the seed picker. */
export async function seedSources(): Promise<
  { source: string; count: number }[]
> {
  const counts = new Map<string, number>();
  for (const row of await homebrewPricedRows()) {
    counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
  }
  return [...counts]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => a.source.localeCompare(b.source));
}

async function homebrewPricedRows(): Promise<
  { source: string; entity: Entity }[]
> {
  return (await homebrewPriced())
    .map((entity) => ({ source: variantSource(entity) ?? '', entity }))
    .filter(({ source, entity }) => source && seedPrices([entity]).length > 0);
}

/**
 * Rows from one homebrew source's own item values, each listing the sources
 * the site prints that name in (see `prefillSources`).
 */
export async function seedItemPrices(source: string): Promise<ItemPrice[]> {
  const want = source.toLowerCase();
  const [rows, printed] = await Promise.all([
    homebrewPricedRows(),
    itemNameSources(),
  ]);
  return seedPrices(
    rows.filter((r) => r.source.toLowerCase() === want).map((r) => r.entity),
    printed,
  );
}
