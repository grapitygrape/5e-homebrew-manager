/**
 * engine/index.ts — public barrel for the homebrew-manager engine.
 *
 * INTENT
 *   The engine is the runtime-agnostic heart of the app: pure functions that
 *   merge, resolve, render, audit, and validate 5etools homebrew data. No fs, no
 *   DOM, no fetch — so it runs identically on the SvelteKit server, in the
 *   browser, and in tests. The DataSource layer (../data) handles all I/O and
 *   feeds these functions.
 *
 * IMPORT STYLE
 *   Relative imports keep their `.ts` extension on purpose: it lets the same
 *   files run under Node's native type-stripping (tests) AND build with Vite.
 *   tsconfig sets `allowImportingTsExtensions` so svelte-check is happy too.
 */
export * from './types.ts';
export { LINK_TAGS, splitLinkTag } from './tag-registry.ts';
export type { LinkTagDef, LinkTagParts } from './tag-registry.ts';
export * from './render/index.ts';
export * from './merge/index.ts';
export * from './audit/index.ts';
export {
  itemHash,
  hashToName,
  buildItemIndex,
  resolveItemList,
  normalizeVariantItem,
  classifyUnresolved,
} from './item-list.ts';
export type {
  ShopListEntry,
  ShopRow,
  ResolvedShopList,
  UnresolvedReason,
  EntrySnapshot,
  EntryChoices,
  SpellOffer,
} from './item-list.ts';
export {
  buildShopBook,
  validateShopBookOptions,
  groupRowsByType,
  itemCell,
  isTaggable,
  chapterId,
  ITEM_TYPE_LABELS,
  itemTypeLabel,
} from './shop-book.ts';
export type {
  ShopBookChapter,
  ShopBookOptions,
  ShopBookDoc,
} from './shop-book.ts';
export {
  ANY_SOURCE,
  buildPriceLookup,
  mergePrices,
  parsePriceFile,
  parsePriceImport,
  prefillSources,
  priceDocument,
  priceKey,
  rowKeys,
  rowMatches,
  seedPrices,
  stringifyPriceFile,
  toSources,
} from './item-prices.ts';
export type { ItemPrice } from './item-prices.ts';
