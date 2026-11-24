// 5etools DOM decoration & list-page hooks for the site browser window:
// pinned-list send/clear/shop buttons and item-card send/shop buttons.

import { button, make } from './picker.js';
import { isShopPage, pinnedEntries, shownEntries } from './shops.js';
import {
  CARD_MENU_ICON,
  CARD_SEND_SOURCE,
  LIST_RELOAD_BUTTON,
  PINNED_ROW,
  SHOP_ICON,
  SITE_CARD_SEND,
} from './styles.js';
import { toast } from './transport.js';

export const createDomHooks = ({ state, onOpenShopPicker }) => {
  // The site's list actions live in a module, out of reach, and only it knows about
  // scaled creatures and other custom variants. So open its menu on a pinned row
  // and press the item, all before the menu can paint.
  const pressListMenuItem = (label) => {
    const row =
      document.querySelector(`${PINNED_ROW}.list-multi-selected`) ??
      document.querySelector(PINNED_ROW);
    if (!row) return;

    const anchor = state.lastClick;
    row.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window }),
    );
    const item = [...document.querySelectorAll('.ve-ui-ctx__btn')].find(
      (btn) => btn.textContent === label,
    );
    if (item) item.click();
    else toast(`Could not find the site's "${label}" action.`, 'danger');
    // That scripted click has no position, and the picker opens at the last click.
    state.lastClick = anchor;
  };

  const clearPinnedList = async () => {
    const count = document.querySelectorAll(PINNED_ROW).length;
    const isSure = await InputUiUtil.pGetUserBoolean({
      title: 'Clear Pinned List',
      htmlDescription: `Remove ${count === 1 ? 'the 1 entry' : `all ${count} entries`} from this list?`,
      textYes: 'Clear',
      textNo: 'Cancel',
    });
    if (isSure) pressListMenuItem('Clear List');
  };

  const makeListActions = () => {
    const actions = make('div', 'hm-list-actions ve-btn-group');
    actions.dataset.hbmListActions = 'true';

    // Dressed as the site's own card send button, so every send looks the same.
    const send = button('hm-send-foundry ve-btn ve-btn-5et ve-btn-xs ve-btn-primary');
    // The title also brings it under the disabled send button rules.
    send.title = 'Send to Foundry (all pinned entries)';
    send.append(make('span', 'glyphicon glyphicon-send'));
    send.addEventListener('click', () => pressListMenuItem('Send to Foundry'));

    const clear = button('ve-btn ve-btn-5et ve-btn-xs ve-btn-default');
    clear.title = 'Clear Pinned List';
    clear.append(make('span', 'glyphicon glyphicon-remove'));
    clear.addEventListener('click', () => void clearPinnedList());

    actions.append(send, clear);
    if (isShopPage()) {
      const shop = button('hm-add-shop ve-btn ve-btn-5et ve-btn-xs ve-btn-default');
      shop.title = 'Add everything in this list to a Shop';
      shop.innerHTML = SHOP_ICON;
      shop.addEventListener('click', () => void onOpenShopPicker(pinnedEntries(state.listPage)));
      actions.append(shop);
    }
    return actions;
  };

  const addListActions = () => {
    const hasPins = !!document.querySelector(PINNED_ROW);
    for (const reload of document.querySelectorAll(LIST_RELOAD_BUTTON)) {
      const group = reload.parentElement;
      let actions = group.nextElementSibling;
      if (!actions?.dataset?.hbmListActions) {
        actions = makeListActions();
        group.after(actions);
      }
      for (const btn of actions.children) btn.disabled = !hasPins;
    }
  };

  // The site's own button is hidden, but keeps the job: it knows which entry it's
  // on, including scaled creatures, and reads shift for a temporary import.
  const sendCard = (evt) => {
    const source = document.querySelector(CARD_SEND_SOURCE);
    if (!source) return;
    const anchor = state.lastClick;
    source.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: !!evt.shiftKey,
      }),
    );
    state.lastClick = anchor;
  };

  const addCardSend = () => {
    const tabs = document.getElementById('tabs-right');
    if (!tabs) return;
    let send = document.querySelector('.hm-send-card');
    // The reskinned site has its own, which can arrive after ours.
    if (document.querySelector(SITE_CARD_SEND)) {
      send?.remove();
      return;
    }
    if (!send) {
      send = button(
        'hm-send-card hm-send-foundry ve-ui-tab__btn-tab-head ve-btn ve-btn-default ve-pt-2p ve-px-4p ve-pb-0 ve-w-24p',
      );
      send.title = 'Send to Foundry (SHIFT for Temporary Import)';
      send.append(make('span', 'glyphicon glyphicon-send'));
      send.addEventListener('click', sendCard);
      tabs.append(send);
    }
    send.disabled = !document.querySelector(CARD_SEND_SOURCE);
  };

  const addCardShop = () => {
    const tabs = document.getElementById('tabs-right');
    if (!tabs || !isShopPage()) return;
    let shop = document.querySelector('.hm-add-shop-card');
    if (!shop) {
      shop = button(
        'hm-add-shop hm-add-shop-card ve-ui-tab__btn-tab-head ve-btn ve-btn-default ve-pt-2p ve-px-4p ve-pb-0 ve-w-24p',
      );
      shop.title = 'Add to a shop in the manager';
      shop.innerHTML = SHOP_ICON;
      shop.addEventListener('click', () => void onOpenShopPicker(shownEntries(state.listPage)));
      tabs.append(shop);
    }
    // Before the overflow menu, which the site can add after this.
    const menu = document.querySelector(CARD_MENU_ICON)?.parentElement;
    if (menu && menu.previousElementSibling !== shop) menu.before(shop);
    shop.disabled = !state.listPage?._lastRender?.entity;
  };

  const decoratePage = () => {
    addListActions();
    addCardSend();
    addCardShop();
  };

  // The site's page object is module-scoped, so catch it as it loads an entry.
  // It knows the entry on show and the pinned list, with counts.
  const hookListPage = () => {
    const proto = typeof ListPage === 'undefined' ? null : ListPage.prototype;
    const original = proto?.pDoLoadHash;
    if (!original || original.hbmHooked) return;
    proto.pDoLoadHash = function (...args) {
      state.listPage = this;
      return original.apply(this, args).finally(decoratePage);
    };
    proto.pDoLoadHash.hbmHooked = true;
  };

  return { hookListPage, decoratePage, pressListMenuItem, clearPinnedList, sendCard };
};
