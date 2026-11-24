// Shop-list integration for items.html and spells.html in the site browser.
// Spells sell as scrolls or as a spellcasting service; the manager's Shops > Lists picks which.

import { invoke, toast } from './transport.js';

export const SHOP_PAGES = new Set(['items.html', 'spells.html']);

export const currentPage = () =>
  typeof UrlUtil !== 'undefined' && typeof UrlUtil.getCurrentPage === 'function'
    ? UrlUtil.getCurrentPage()
    : '';

export const isShopPage = () => SHOP_PAGES.has(currentPage());

export const isSpellsPage = () => currentPage() === 'spells.html';

/**
 * A shop entry: the site's hash and count, plus what it shows for the manager.
 * @param {any} entity
 * @param {number} [count]
 * @param {any} [listPage]
 */
export const toShopEntry = (entity, count = 1, listPage = null) => {
  const entry = {
    h: UrlUtil.autoEncodeHash(entity),
    c: count,
    name: String(entity._displayName || entity.name || ''),
    source: String(entity.source ?? ''),
  };
  const customHashId = listPage?._sublistManager?._getCustomHashId?.({ entity });
  if (customHashId) entry.customHashId = String(customHashId);
  if (isSpellsPage()) {
    entry.page = 'spells.html';
    if (Number.isInteger(entity.level)) entry.level = entity.level;
  } else if (typeof entity.value === 'number') {
    entry.value = entity.value;
  }
  return entry;
};

export const shownEntries = (listPage) => {
  const entity = listPage?._lastRender?.entity;
  return entity ? [toShopEntry(entity, 1, listPage)] : [];
};

export const pinnedEntries = (listPage) =>
  (listPage?._sublistManager?.getSublistedEntityMetas?.() ?? []).map(({ entity, count }) =>
    toShopEntry(entity, count ?? 1, listPage),
  );

export const addToShop = async (target, entries, invokeFn = invoke, toastFn = toast) => {
  try {
    const added = await invokeFn('shop_add', { ...target, entries });
    const what =
      entries.length === 1 ? entries[0].name || 'it' : `${entries.length} entries`;
    toastFn(`Added ${what} to ${added.name} in the manager.`, 'success');
  } catch (err) {
    toastFn(`Could not add to the shop: ${err?.message ?? err}`, 'danger');
  }
};

export const openShopPicker = async (
  entries,
  showShopPicker,
  invokeFn = invoke,
  toastFn = toast,
) => {
  if (!entries.length) return;
  let shops;
  try {
    shops = await invokeFn('shop_list');
  } catch (err) {
    toastFn(`Could not read the manager's shops: ${err?.message ?? err}`, 'danger');
    return;
  }
  showShopPicker(shops, entries);
};
