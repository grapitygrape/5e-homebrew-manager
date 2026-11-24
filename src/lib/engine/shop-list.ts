/**
 * engine/shop-list.ts — the shop list file: a 5etools items-sublist with a
 * snapshot of each item, kept in `{data folder}/content/shops/`.
 *
 * INTENT
 *   The site's "Load list" opens these files and its "Export list" files import
 *   as shops, so the shape stays the site's: `{ fileType, name, items: [{h, c}],
 *   sources }`. Each entry may also carry `name`, `source` and `value` (copper)
 *   as the site showed them when it was added. The site ignores those; the
 *   manager falls back to them for items its catalog can't resolve, such as
 *   specific magic variants the site generates at load time.
 *
 *   Spells share the file: `page: "spells.html"`, a `level`, and `as`
 *   ("scroll", the default, or "spell" for a spellcasting service). The site's
 *   Load list is for items, so `siteListExport` leaves spells out. `cost` (gp)
 *   is the DM's price for the shop, over the item's own value.
 *
 * REUSE NOTES
 *   - Pure: no fs. `services/shop-service.ts` reads and writes the files.
 *   - The Rust side (`src-tauri/src/shops.rs`) adds entries from the site
 *     browser with the same merge rule as `addShopEntries`: same page, hash
 *     and custom hash id adds to the count.
 */
import { SPELLS_PAGE } from './item-list.ts';
import type {
  EntryChoices,
  EntrySnapshot,
  ShopListEntry,
} from './item-list.ts';

export const SHOP_FILE_TYPE = 'items-sublist';

/**
 * One stocked item or spell. `h` and `c` are the site's; the snapshot is what
 * the site showed; the choices are the DM's.
 */
export interface ShopEntry extends ShopListEntry, EntrySnapshot, EntryChoices {
  /** The site's id for a customised entity (scaled creatures and the like). */
  customHashId?: string;
}

const nonNegative = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;

export interface ShopFile {
  fileType: typeof SHOP_FILE_TYPE;
  name: string;
  items: ShopEntry[];
  sources?: string[];
  [key: string]: unknown;
}

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** One entry from a file or the site, or null when it has no hash. */
export function cleanShopEntry(raw: unknown): ShopEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const h = text(r.h);
  if (!h) return null;
  const count = typeof r.c === 'number' ? r.c : Number(r.c);
  const entry: ShopEntry = {
    h,
    c: Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1,
  };
  const custom = text(r.customHashId ?? r.customhashid);
  if (custom) entry.customHashId = custom;
  const name = text(r.name);
  if (name) entry.name = name;
  const source = text(r.source);
  if (source) entry.source = source;
  const value = nonNegative(r.value);
  if (value !== undefined) entry.value = value;
  const cost = nonNegative(r.cost);
  if (cost !== undefined) entry.cost = cost;
  if (r.page === SPELLS_PAGE) {
    entry.page = SPELLS_PAGE;
    const level = r.level;
    if (typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= 9)
      entry.level = level;
    if (r.as === 'scroll' || r.as === 'spell') entry.as = r.as;
  }
  return entry;
}

const entryKey = (e: ShopEntry): string =>
  [e.page ?? '', e.h, e.customHashId ?? ''].join('\u0000');

export const isSpellEntry = (e: ShopEntry): boolean => e.page === SPELLS_PAGE;

/**
 * The sources the entries come from, for the site's Load list. Only snapshot
 * sources: a hash has lost the source's case, which brew codes depend on.
 */
export function shopSources(items: ShopEntry[]): string[] {
  return [...new Set(items.flatMap((e) => (e.source ? [e.source] : [])))];
}

/**
 * Read a shop file leniently: entries without a hash are dropped and a
 * missing name falls back to `fallbackName`. Other keys are kept.
 */
export function parseShopFile(json: unknown, fallbackName: string): ShopFile {
  const doc =
    json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  const items = (Array.isArray(doc.items) ? doc.items : [])
    .map(cleanShopEntry)
    .filter((e): e is ShopEntry => !!e);
  return {
    ...doc,
    fileType: SHOP_FILE_TYPE,
    name: text(doc.name) ?? fallbackName,
    items,
  };
}

/**
 * A 5etools "Export list" file as a shop. Accepts the items-sublist shape and
 * the `{ exportedSublist }` wrapper. Throws with a readable reason when the
 * file isn't an item list.
 */
export function normalizeShopListImport(
  json: unknown,
  fallbackName = 'Imported list',
): ShopFile {
  if (!json || typeof json !== 'object') throw new Error('Not a JSON object.');
  let doc = json as Record<string, unknown>;
  if (doc.exportedSublist && typeof doc.exportedSublist === 'object') {
    doc = { ...doc, ...(doc.exportedSublist as Record<string, unknown>) };
    delete doc.exportedSublist;
  }
  if (typeof doc.fileType === 'string' && doc.fileType !== SHOP_FILE_TYPE) {
    throw new Error(
      `Wrong list type: expected an items list export, got "${doc.fileType}".`,
    );
  }
  if (!Array.isArray(doc.items))
    throw new Error('No "items" array — is this a 5etools list export?');
  const shop = parseShopFile(doc, fallbackName);
  if (!shop.items.length)
    throw new Error('The list contains no item entries.');
  return shop;
}

/**
 * Add entries to a shop. An entry already stocked (same hash and custom hash
 * id) adds its count to the existing one and refreshes the snapshot.
 */
export function addShopEntries(shop: ShopFile, entries: ShopEntry[]): ShopFile {
  const items = shop.items.map((e) => ({ ...e }));
  const byKey = new Map(items.map((e) => [entryKey(e), e]));
  for (const entry of entries) {
    const have = byKey.get(entryKey(entry));
    if (have) {
      Object.assign(have, { ...entry, c: have.c + entry.c });
    } else {
      const copy = { ...entry };
      items.push(copy);
      byKey.set(entryKey(copy), copy);
    }
  }
  return { ...shop, items, sources: shopSources(items) };
}

/** A new, empty shop. */
export const emptyShop = (name: string): ShopFile => ({
  fileType: SHOP_FILE_TYPE,
  name: name.trim(),
  items: [],
  sources: [],
});

/**
 * A file name for a shop: `Trollskull Alley Goods` → `trollskull-alley-goods.json`,
 * with `-2`, `-3`… when the name is taken (compared without case).
 */
export function shopFileName(name: string, taken: string[] = []): string {
  const slug =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shop';
  const used = new Set(taken.map((t) => t.toLowerCase()));
  let file = `${slug}.json`;
  for (let n = 2; used.has(file); n++) file = `${slug}-${n}.json`;
  return file;
}

/** True for a bare `*.json` file name, so a request can't reach outside the folder. */
export const isShopFileName = (file: string): boolean =>
  /^[^\\/:*?"<>|]+\.json$/i.test(file) && !file.startsWith('.');

export const stringifyShopFile = (shop: ShopFile): string =>
  JSON.stringify({ ...shop, sources: shopSources(shop.items) }, null, 2) + '\n';

/** The shop as a file the site's Load list opens: items only, as that list is the items page's. */
export function siteListExport(shop: ShopFile): string {
  return stringifyShopFile({ ...shop, items: shop.items.filter((e) => !isSpellEntry(e)) });
}
