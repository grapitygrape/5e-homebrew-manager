/**
 * engine/item-list.ts — resolve 5etools "items-sublist" lists against a catalog.
 *
 * INTENT
 *   A saved shop list (`fileType: "items-sublist"`) references items by hash:
 *   `{ "h": "thieves'%20tools_xphb", "c": 1 }`. The hash is
 *   `encodeURIComponent(name.toLowerCase()).toLowerCase()` + "_" + source. This
 *   module reproduces that hash, indexes a merged item catalog by it, and
 *   resolves a list's entries into display rows + totals. Pure + tested, so the
 *   Shop view and the server share one definition.
 *
 * REUSE NOTES
 *   - `itemHash` must stay byte-compatible with 5etools' sublist export. Verified
 *     against real lists (spaces→%20, commas→%2c, apostrophes/parens kept).
 *   - Unresolved hashes still render (name recovered via `hashToName`), flagged
 *     `found: false`, so a list never silently drops entries.
 */
import type { Entity, BlocklistLookup } from './types.ts';
import { isBlocked } from './merge/blocklist.ts';

export interface ShopListEntry {
  /** Item hash. */
  h: string;
  /** Count / quantity. */
  c: number;
}

/** The site page a spell entry came from. Entries without a page are items. */
export const SPELLS_PAGE = 'spells.html';

/** How a shop sells a spell: as a scroll, or as a spellcasting service. */
export type SpellOffer = 'scroll' | 'spell';

/**
 * Why a row isn't from the catalog. `site`: the catalog doesn't have it but the
 * entry carries what the site showed, as for a specific magic variant, which
 * the site generates at load time.
 */
export type UnresolvedReason = 'blocklisted' | 'stale' | 'site';

/** What the site showed when an entry was added (see engine/shop-list.ts). */
export interface EntrySnapshot {
  name?: string;
  source?: string;
  /** Copper. */
  value?: number;
  /** Spells: 0 for a cantrip. */
  level?: number;
}

/** What the DM chose for an entry in Shops > Lists. */
export interface EntryChoices {
  /** `spells.html` for a spell; absent for an item. */
  page?: string;
  /** Spells only; absent means a scroll. */
  as?: SpellOffer;
  /** The shop's price in gp, over the item's own. */
  cost?: number;
}

export interface ShopRow {
  hash: string;
  quantity: number;
  found: boolean;
  name: string;
  source: string;
  kind: 'item' | 'spell';
  /** Base item type code (e.g. 'G', 'T', 'M'); 'spell' for a spell; '—' when unresolved. */
  type: string;
  /** Spell level (0 for a cantrip); null for items. */
  level: number | null;
  /** Spells: sold as a scroll or as a spellcasting service. */
  as?: SpellOffer;
  /** The item's own value in copper (the catalog's, else the site's), or null. */
  baseValueCp: number | null;
  /** What the shop charges in copper: the entry's cost when set, else the base. */
  valueCp: number | null;
  weight: number | null;
  /** Why a row is unresolved; set when found is false. */
  unresolvedReason?: UnresolvedReason;
}

export interface ResolvedShopList {
  rows: ShopRow[];
  /** Sum of value×quantity over rows with a value, in copper. */
  totalCp: number;
  foundCount: number;
  missingCount: number;
}

/** The 5etools items-sublist hash for an item name + source. */
export function itemHash(name: string, source: string): string {
  return `${encodeURIComponent(name.toLowerCase()).toLowerCase()}_${source.toLowerCase()}`;
}

/** Best-effort recovery of a display name + source from a hash (for unresolved entries). */
export function hashToName(hash: string): { name: string; source: string } {
  const idx = hash.lastIndexOf('_');
  const namePart = idx >= 0 ? hash.slice(0, idx) : hash;
  const source = idx >= 0 ? hash.slice(idx + 1) : '';
  let name: string;
  try {
    name = decodeURIComponent(namePart);
  } catch {
    name = namePart;
  }
  name = name
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
  return { name, source: source.toUpperCase() };
}

const CATALOG_BLOCKLIST_CATEGORIES = [
  'item',
  'itemGroup',
  'baseitem',
  'magicvariant',
];

/** Classify an unresolved sublist hash (blocklisted vs stale/unavailable). */
export function classifyUnresolved(
  hash: string,
  blocklist: BlocklistLookup,
): UnresolvedReason {
  const { name, source } = hashToName(hash);
  const entity = { name, source };
  if (
    CATALOG_BLOCKLIST_CATEGORIES.some((cat) =>
      isBlocked(entity, cat, blocklist),
    )
  ) {
    return 'blocklisted';
  }
  return 'stale';
}

/** Index a merged item catalog by sublist hash. */
export function buildItemIndex(items: Entity[]): Map<string, Entity> {
  const index = new Map<string, Entity>();
  for (const it of items) {
    if (typeof it.name === 'string' && typeof it.source === 'string') {
      index.set(itemHash(it.name, it.source), it);
    }
  }
  return index;
}

/** A gp cost as copper, or null when there's none. */
const costCp = (cost: number | undefined): number | null =>
  typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
    ? Math.round(cost * 100)
    : null;

/** Why an entry isn't in its catalog: hidden, known from the site, or gone. */
function missingReason(
  entry: ShopListEntry & EntrySnapshot,
  isSpell: boolean,
  blocklist?: BlocklistLookup,
): UnresolvedReason | undefined {
  if (blocklist) {
    const { name, source } = hashToName(entry.h);
    const blocked = isSpell
      ? isBlocked({ name, source }, 'spell', blocklist) ||
        (!!entry.source && isBlocked({ name, source: entry.source }, 'spell', blocklist))
      : classifyUnresolved(entry.h, blocklist) === 'blocklisted';
    if (blocked) return 'blocklisted';
  }
  if (entry.name) return 'site';
  return blocklist ? 'stale' : undefined;
}

/**
 * Resolve shop entries to rows + totals. Items look up `index`; spell entries
 * (`page: spells.html`) look up `spellIndex`. An entry's own `cost` (gp) is
 * what the shop charges; blocklisted rows stay out of the total.
 */
export function resolveItemList(
  entries: (ShopListEntry & EntrySnapshot & EntryChoices)[],
  index: Map<string, Entity>,
  blocklist?: BlocklistLookup,
  spellIndex?: Map<string, Entity>,
): ResolvedShopList {
  const rows: ShopRow[] = [];
  let totalCp = 0;
  let foundCount = 0;
  let missingCount = 0;

  for (const entry of entries) {
    const quantity = entry.c ?? 1;
    const isSpell = entry.page === SPELLS_PAGE;
    const hit = (isSpell ? spellIndex : index)?.get(entry.h);
    const override = costCp(entry.cost);
    const snapshotLevel = typeof entry.level === 'number' ? entry.level : null;
    let row: ShopRow;

    if (hit) {
      foundCount++;
      const baseValueCp = !isSpell && typeof hit.value === 'number' ? hit.value : null;
      row = {
        hash: entry.h,
        quantity,
        found: true,
        name: String(hit.name),
        source: String(hit.source),
        kind: isSpell ? 'spell' : 'item',
        type: isSpell ? 'spell' : String(hit.type ?? 'OTH').split('|')[0],
        level: isSpell ? (typeof hit.level === 'number' ? hit.level : snapshotLevel) : null,
        baseValueCp,
        valueCp: override ?? baseValueCp,
        weight: !isSpell && typeof hit.weight === 'number' ? hit.weight : null,
      };
    } else {
      missingCount++;
      const recovered = hashToName(entry.h);
      const reason = missingReason(entry, isSpell, blocklist);
      const blocked = reason === 'blocklisted';
      const baseValueCp =
        !blocked && !isSpell && typeof entry.value === 'number' ? entry.value : null;
      row = {
        hash: entry.h,
        quantity,
        found: false,
        name: entry.name ?? recovered.name,
        source: entry.source ?? recovered.source,
        kind: isSpell ? 'spell' : 'item',
        type: isSpell ? 'spell' : '—',
        level: isSpell ? snapshotLevel : null,
        baseValueCp,
        // A blocklisted entry stays out of the total, whatever it costs.
        valueCp: blocked ? null : (override ?? baseValueCp),
        weight: null,
        unresolvedReason: reason,
      };
    }
    if (isSpell) row.as = entry.as === 'spell' ? 'spell' : 'scroll';
    if (row.valueCp != null) totalCp += row.valueCp * quantity;
    rows.push(row);
  }

  return { rows, totalCp, foundCount, missingCount };
}

/**
 * Hoist a generic variant's `inherits` fields up to the top level when missing.
 *
 * 5etools generic variants (Adamantine, Vorpal, homebrew like Champion's Weapon)
 * keep their real source/value/rarity inside `inherits`. Without a top-level
 * `source` they fail the blocklist (treated as blocked) and never index by hash,
 * so they'd silently vanish from the catalog. This makes them behave like items.
 * Idempotent; returns the entity unchanged when there's no `inherits`.
 */
export function normalizeVariantItem(entity: Entity): Entity {
  const inherits = entity.inherits;
  if (!inherits || typeof inherits !== 'object' || Array.isArray(inherits))
    return entity;
  const inh = inherits as Record<string, unknown>;
  const out: Entity = { ...entity };
  if (out.source == null && typeof inh.source === 'string')
    out.source = inh.source;
  if (out.value == null && typeof inh.value === 'number') out.value = inh.value;
  if (out.weight == null && typeof inh.weight === 'number')
    out.weight = inh.weight;
  if (out.rarity == null && typeof inh.rarity === 'string')
    out.rarity = inh.rarity;
  if (out.type == null)
    out.type = typeof inh.type === 'string' ? inh.type : 'GV';
  return out;
}
