/**
 * engine/item-prices.ts — the DM's price list, and the pricer that writes it
 * into item data on deploy.
 *
 * INTENT
 *   `content/item-prices.json` lists prices in gp by item name, each row for
 *   the sources it lists. `*` matches any source no other row for that name
 *   lists, so `["DMG", "XDMG", "*"]` names the printings the DM checked and
 *   still covers the rest. On deploy, every matching item's `value` (copper)
 *   is replaced and the item gets `hbmPrice: { min?, max?, original? }` for the
 *   site's hover. Nothing here is content replacement: no items are added or
 *   redirected, only prices change.
 *
 * REUSE NOTES
 *   - `src-tauri/src/item_prices.rs` is a port of `priceDocument` for Prepare
 *     and the site deploy. Both run fixtures/item-prices, so change them
 *     together.
 *   - Magic variants get `valueExpression: "[[baseItem.value]] + cost"` and
 *     `hbmPrice.plusBase`, so a specific variant costs its base item plus the
 *     price; the hover adds the base to min and max the same way.
 *   - `hbmPrice` doubles as the "already priced" marker: an empty one still
 *     stops a second pass recording the last price as the original.
 *   - Older files gave `source` as one string, or left it out for any source.
 *     Both still load: a string is split on commas, and none means `["*"]`.
 *   - A brew entry that `_copy`s an item of the same name is that item
 *     reprinted or replaced (content replacement swaps official items for
 *     such copies), so a row for the copied source prices it too. Brew magic
 *     variants are all `_copy` with no `inherits`, so their price goes into
 *     `_copy._mod` as `inherits.*` setProps.
 */
import type { Entity } from './types.ts';

export interface ItemPrice {
  name: string;
  /** Source codes, with `*` for any source no other row claims. Never empty. */
  source: string[];
  /** Average cost in gp. */
  cost: number;
  min?: number;
  max?: number;
}

/** Arrays in a data or brew file whose entries carry a price. */
const PRICED_PROPS = ['item', 'baseitem', 'itemGroup'] as const;

export const ANY_SOURCE = '*';

/** Lookup key for one name in one source (or `*`). */
export const priceKey = (name: string, source: string): string =>
  `${name.trim().toLowerCase()}|${source.trim().toLowerCase()}`;

/** A row's keys, one per source it lists. */
export const rowKeys = (row: ItemPrice): string[] =>
  row.source.map((s) => priceKey(row.name, s));

/**
 * Source codes from loose input: an array, or one comma-separated string.
 * Case-insensitive duplicates go, `*` sorts last, and nothing means `*`.
 */
export function toSources(raw: unknown): string[] {
  const parts = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [])
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out = parts.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const codes = out.filter((s) => s !== ANY_SOURCE);
  return codes.length === out.length ? (codes.length ? codes : [ANY_SOURCE]) : [...codes, ANY_SOURCE];
}

/**
 * Sources to fill in for a name the catalog prints in `printed`: those
 * printings, plus `*` when there's more than one (or none) so a reprint the
 * list hasn't seen is still covered.
 */
export function prefillSources(printed: string[]): string[] {
  const codes = toSources([...printed].sort((a, b) => a.localeCompare(b)));
  return codes.length > 1 && !codes.includes(ANY_SOURCE) ? [...codes, ANY_SOURCE] : codes;
}

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(/,/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/** One row from loose input, or a reason it can't be one. */
function toRow(raw: Record<string, unknown>): ItemPrice | string {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) return 'has no name.';
  const cost = toNumber(raw.cost);
  if (cost === undefined || cost < 0) return `"${name}" has no cost.`;
  const source = toSources(raw.source);
  const min = toNumber(raw.min);
  const max = toNumber(raw.max);
  // Key order stays name, source, cost, min, max for a readable file.
  return {
    name,
    source,
    cost,
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  };
}

const rowsOf = (json: unknown): unknown[] =>
  Array.isArray(json)
    ? json
    : json && typeof json === 'object' && Array.isArray((json as { prices?: unknown }).prices)
      ? (json as { prices: unknown[] }).prices
      : [];

/** The saved file's rows. Unusable rows are dropped rather than failing the load. */
export function parsePriceFile(json: unknown): ItemPrice[] {
  return rowsOf(json)
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map(toRow)
    .filter((r): r is ItemPrice => typeof r !== 'string');
}

/** The file text. Each `source` stays on one line so a row reads at a glance. */
export function stringifyPriceFile(rows: ItemPrice[]): string {
  const marked = rows.map((r, i) => ({ ...r, source: `\u0000${i}` }));
  return (
    JSON.stringify({ prices: marked }, null, 2).replace(/"\\u0000(\d+)"/g, (_, i: string) =>
      JSON.stringify(rows[Number(i)].source).replace(/","/g, '", "'),
    ) + '\n'
  );
}

/** Split CSV text into records, honouring quotes (with "" escapes) and CRLF. */
function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

/** An imported CSV or JSON file's rows, plus one message per row it skipped. */
export function parsePriceImport(text: string): {
  rows: ItemPrice[];
  errors: string[];
} {
  const body = text.replace(/^﻿/, '');
  const trimmed = body.trim();
  const rows: ItemPrice[] = [];
  const errors: string[] = [];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch (e) {
      return { rows, errors: [`Not valid JSON: ${(e as Error).message}`] };
    }
    rowsOf(json).forEach((raw, i) => {
      const r = raw && typeof raw === 'object' ? toRow(raw as Record<string, unknown>) : 'is not an object.';
      if (typeof r === 'string') errors.push(`Row ${i + 1}: ${r}`);
      else rows.push(r);
    });
    return { rows, errors };
  }

  const records = parseCsv(body).filter((r) => r.some((c) => c.trim() !== ''));
  if (!records.length) return { rows, errors: ['The file is empty.'] };
  const header = records[0].map((h) => h.trim().toLowerCase());
  if (!header.includes('name') || !header.includes('cost'))
    return { rows, errors: ['The CSV needs a "name" and a "cost" column.'] };
  records.slice(1).forEach((cells, i) => {
    const raw: Record<string, unknown> = {};
    header.forEach((h, c) => (raw[h] = cells[c] ?? ''));
    const r = toRow(raw);
    // Line numbers count the header as line 1.
    if (typeof r === 'string') errors.push(`Line ${i + 2}: ${r}`);
    else rows.push(r);
  });
  return { rows, errors };
}

/**
 * Existing rows with incoming ones laid over them. An incoming row takes its
 * sources away from existing rows of the same name; one left with no sources
 * goes, and the incoming row takes the place of the first it touched.
 */
export function mergePrices(existing: ItemPrice[], incoming: ItemPrice[]): ItemPrice[] {
  let out: (ItemPrice | null)[] = [...existing];
  for (const row of incoming) {
    const keys = new Set(rowKeys(row));
    let at = -1;
    out = out.map((r, i) => {
      if (!r || !rowKeys(r).some((k) => keys.has(k))) return r;
      if (at < 0) at = i;
      const left = r.source.filter((s) => !keys.has(priceKey(r.name, s)));
      return left.length ? { ...r, source: left } : null;
    });
    if (at < 0) out.push(row);
    else if (out[at]) out.splice(at, 0, row);
    else out[at] = row;
  }
  return out.filter((r): r is ItemPrice => !!r);
}

/**
 * Rows from a source's own item values, for a first dataset. `printed` maps
 * lower-cased names to the sources the catalog prints them in, for
 * `prefillSources`; a name it doesn't know gets `*`.
 */
export function seedPrices(
  entities: Entity[],
  printed: Record<string, string[]> = {},
): ItemPrice[] {
  const rows: ItemPrice[] = [];
  for (const e of entities) {
    const inherits = e.inherits as Record<string, unknown> | undefined;
    const value = toNumber(e.value) ?? toNumber(inherits?.value);
    if (typeof e.name !== 'string' || value === undefined) continue;
    const source = prefillSources(printed[e.name.toLowerCase()] ?? []);
    rows.push({ name: e.name, source, cost: value / 100 });
  }
  return mergePrices([], rows);
}

/**
 * Find the row for an item: one listing its source first, then one listing
 * `copiedSource` (the item it copies), then one with `*`.
 */
export function buildPriceLookup(
  rows: ItemPrice[],
): (name: string, source: string | undefined, copiedSource?: string) => ItemPrice | null {
  const map = new Map<string, ItemPrice>();
  for (const r of rows) for (const k of rowKeys(r)) map.set(k, r);
  return (name, source, copiedSource) =>
    (source ? map.get(priceKey(name, source)) : undefined) ??
    (copiedSource ? map.get(priceKey(name, copiedSource)) : undefined) ??
    map.get(priceKey(name, ANY_SOURCE)) ??
    null;
}

/**
 * The sources each row will price, in row order. `names` is every item name
 * (lower-cased) with its sources. A row's `*` gets the sources no row for that
 * name lists.
 */
export function rowMatches(
  rows: ItemPrice[],
  names: Record<string, string[]>,
): string[][] {
  const claimed = new Set(
    rows.flatMap((r) => r.source.filter((s) => s !== ANY_SOURCE).map((s) => priceKey(r.name, s))),
  );
  return rows.map((row) => {
    const name = row.name.trim().toLowerCase();
    const want = new Set(row.source.map((s) => s.toLowerCase()));
    return (names[name] ?? []).filter((s) =>
      want.has(s.toLowerCase()) ||
      (want.has(ANY_SOURCE) && !claimed.has(priceKey(name, s))),
    );
  });
}

const cp = (gp: number): number => Math.round(gp * 100);

/** Set `value` and `hbmPrice` on one record (an item, or a variant's `inherits`). */
function applyPrice(target: Record<string, unknown>, price: ItemPrice): void {
  const prior = target.hbmPrice as { original?: unknown } | undefined;
  const original = prior ? toNumber(prior.original) : toNumber(target.value);
  const meta: Record<string, number> = {};
  if (price.min !== undefined) meta.min = cp(price.min);
  if (price.max !== undefined) meta.max = cp(price.max);
  if (original !== undefined) meta.original = original;
  target.value = cp(price.cost);
  target.hbmPrice = meta;
}

type Copy = { name?: unknown; source?: unknown; _mod?: Record<string, unknown> };

/** The `_copy` of an entry copying an item of the same name, or undefined. */
function sameNameCopy(ent: Record<string, unknown>): Copy | undefined {
  const copy = ent._copy as Copy | undefined;
  if (!copy || typeof copy !== 'object' || typeof copy.name !== 'string') return undefined;
  return copy.name.trim().toLowerCase() === String(ent.name).trim().toLowerCase() ? copy : undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The value a `_mod` entry sets with setProp (one mod or a list), if any. */
function setPropValue(mod: unknown): unknown {
  const list = Array.isArray(mod) ? mod : [mod];
  const set = list.filter((m) => m && typeof m === 'object' && m.mode === 'setProp').at(-1);
  return set?.value;
}

/** Price a `_copy` magic variant through its mods, as `priceDocument` prices `inherits`. */
function priceVariantCopy(copy: Copy, price: ItemPrice): void {
  const mod = (copy._mod ??= {});
  const prior = setPropValue(mod['inherits.hbmPrice']) as { original?: unknown } | undefined;
  const original = prior ? toNumber(prior.original) : toNumber(setPropValue(mod['inherits.value']));
  const meta: Record<string, unknown> = {};
  if (price.min !== undefined) meta.min = cp(price.min);
  if (price.max !== undefined) meta.max = cp(price.max);
  if (original !== undefined) meta.original = original;
  meta.plusBase = true;
  mod['inherits.valueExpression'] = { mode: 'setProp', value: `[[baseItem.value]] + ${cp(price.cost)}` };
  mod['inherits.value'] = { mode: 'setProp', value: cp(price.cost) };
  mod['inherits.hbmPrice'] = { mode: 'setProp', value: meta };
  mod['inherits.valueMult'] = 'remove';
}

/** Price every matching item in a data or brew file in place. Returns how many changed. */
export function priceDocument(doc: Record<string, unknown>, rows: ItemPrice[]): number {
  if (!rows.length) return 0;
  const lookup = buildPriceLookup(rows);
  let count = 0;
  for (const prop of PRICED_PROPS) {
    const list = doc[prop];
    if (!Array.isArray(list)) continue;
    for (const ent of list) {
      if (!ent || typeof ent !== 'object' || typeof ent.name !== 'string') continue;
      const price = lookup(ent.name, str(ent.source), str(sameNameCopy(ent)?.source));
      if (!price) continue;
      applyPrice(ent, price);
      count++;
    }
  }
  const variants = doc.magicvariant;
  if (Array.isArray(variants)) {
    for (const v of variants) {
      if (!v || typeof v !== 'object' || typeof v.name !== 'string') continue;
      const inherits = v.inherits;
      const copy = sameNameCopy(v);
      if (!inherits || typeof inherits !== 'object') {
        // A brew variant copying an official one: its inherits only exist after the copy.
        const price = copy && lookup(v.name, str(v.source), str(copy.source));
        if (!copy || !price) continue;
        priceVariantCopy(copy, price);
        count++;
        continue;
      }
      const price = lookup(v.name, str(inherits.source), str(copy?.source));
      if (!price) continue;
      // A specific variant (+1 Plate) costs its base item plus the variant's
      // price. `value` stays as the generic variant's own price and the
      // fallback when a base item has no value; the expression, set after it,
      // overrides it for each specific variant.
      delete inherits.valueExpression;
      delete inherits.valueMult;
      applyPrice(inherits, price);
      inherits.valueExpression = `[[baseItem.value]] + ${cp(price.cost)}`;
      (inherits.hbmPrice as Record<string, unknown>).plusBase = true;
      count++;
    }
  }
  return count;
}
