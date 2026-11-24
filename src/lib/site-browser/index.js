// Injected into the site browser window before each page's own scripts. It plays
// the part of the Rivet extension, so the site's own send buttons work with no
// site patch: it turns on `ExtensionUtil.ACTIVE`, catches `rivet.send`, and passes
// sends to the app. The picker borrows the site's menu classes for its theme.
// Blocklist rules the user adds on the site are copied to the app too, and on
// the items and spells pages entries can be added to the manager's shop lists.

import { createBlocklistBridge } from './blocklist.js';
import { createDomHooks } from './dom-hooks.js';
import { showShopPicker, showTargetPicker } from './picker.js';
import { addToShop, openShopPicker } from './shops.js';
import { SEND_BUTTON, STYLES } from './styles.js';
import {
  invoke,
  markPage,
  notReadyMessage,
  pollStatus,
  sendPackets,
  toast,
} from './transport.js';

const POLL_MS = 3000;
// A pinned list fires one event per entry; gather them into one picker.
const BATCH_MS = 250;
// Only these can go to a chosen actor. Blocklist and encounter builder sends
// have no target, so they pass straight through.
const TARGETED_TYPES = new Set(['entity', 'currency', '5etools.lootgen.loot']);

const state = {
  status: { canSend: false, connected: false },
  lastClick: null,
  pending: [],
  batchTimer: null,
  gathering: false,
  picker: null,
  /** Closes the open shop picker. Apart from the send picker, which owns `picker`. */
  shopPicker: null,
  listPage: null,
};

// Held from opening: clicks inside the picker mustn't move it.
const clickAnchor = () => ({
  x: state.lastClick?.clientX ?? 8,
  y: state.lastClick?.clientY ?? 8,
});

const blocklist = createBlocklistBridge({ batchMs: BATCH_MS });

const launchShopPicker = (shops, entries) => {
  state.shopPicker?.();
  const close = showShopPicker(shops, entries, {
    anchor: clickAnchor(),
    onChoose: (target) => void addToShop(target, entries),
    onClose: (closer) => {
      if (state.shopPicker === closer) state.shopPicker = null;
    },
  });
  state.shopPicker = close;
};

const domHooks = createDomHooks({
  state,
  onOpenShopPicker: (entries) => openShopPicker(entries, launchShopPicker),
});

const gatherDone = async () => {
  // Sends arriving while this runs or the picker is up join this same batch.
  const batch = state.pending;
  let targets;
  try {
    const summaries = batch.map(({ type, data }) => ({ type, page: data?.page }));
    ({ targets } = await invoke('targets', { packets: summaries }));
  } catch (err) {
    state.gathering = false;
    state.pending = [];
    toast(`Could not read the world's actors: ${err?.message ?? err}`, 'danger');
    return;
  }

  // Nothing can take this, such as a creature, which makes its own actor.
  if (targets.every((t) => t.blocked)) {
    state.gathering = false;
    state.pending = [];
    void sendPackets(null, 'the world directory', batch);
    return;
  }

  state.picker = showTargetPicker(targets, batch, {
    anchor: clickAnchor(),
    onChoose: (target) =>
      void sendPackets(target.uuid, target.uuid ? target.name : 'the world directory', batch),
    onClose: () => {
      state.picker = null;
      state.gathering = false;
      state.pending = [];
    },
  });
};

const onReady = () => {
  window.dispatchEvent(new CustomEvent('rivet.active'));
  markPage(state.status);
  blocklist.hookBlocklist();
  domHooks.hookListPage();
  const style = document.createElement('style');
  style.textContent = STYLES;
  document.head.append(style);

  // The site builds its toolbar, and changes the pinned rows, whenever it likes.
  domHooks.decoratePage();
  new MutationObserver(domHooks.decoratePage).observe(document.body, {
    childList: true,
    subtree: true,
  });
};

window.addEventListener(
  'click',
  (evt) => {
    state.lastClick = evt;
    if (state.status.canSend || !evt.target?.closest?.(SEND_BUTTON)) return;
    evt.preventDefault();
    evt.stopPropagation();
    toast(notReadyMessage(state.status), 'warning');
  },
  true,
);

window.addEventListener('rivet.send', (evt) => {
  const packet = evt.detail;
  // The site reports every dice roll here, whether or not anyone is listening.
  if (!packet || packet.type === 'roll') return;

  if (!state.status.canSend) {
    toast(notReadyMessage(state.status), 'warning');
    return;
  }
  if (!TARGETED_TYPES.has(packet.type) || packet.data?.isTemp) {
    void sendPackets(null, 'Foundry', [packet]);
    return;
  }

  state.pending.push(packet);
  state.picker?.updateTitle();
  if (state.gathering) return;
  clearTimeout(state.batchTimer);
  state.batchTimer = setTimeout(() => {
    state.gathering = true;
    void gatherDone();
  }, BATCH_MS);
});

// The site reads ACTIVE as it renders, which can beat any event we could fire,
// so set it the moment the class is defined.
let extensionUtil;
Object.defineProperty(globalThis, 'ExtensionUtil', {
  configurable: true,
  get: () => extensionUtil,
  set: (value) => {
    extensionUtil = value;
    value.ACTIVE = true;
  },
});

document.addEventListener('DOMContentLoaded', onReady);

void pollStatus(state);
setInterval(() => void pollStatus(state), POLL_MS);
