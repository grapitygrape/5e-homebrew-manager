/**
 * banner.js — tell a player an item they are looking at is replaced.
 *
 * Only for items that are NOT on a sheet: once something is on a character the
 * import swap has already dealt with it, and a banner would just nag. GMs see
 * nothing; they set the rules.
 */

import CONSTANTS from './constants.js';
import { ruleFor, attempted } from './intercept.js';
import { ruleKey } from './lib/replacements.js';

const CLASS = 'hm-replaced-banner';

function show(app, root) {
  if (game.user.isGM) return;
  if (!game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.BANNER))
    return;
  const item = app.document ?? app.item;
  if (item?.documentName !== 'Item' || item.parent) return;

  const rule = ruleFor(item.toObject());
  if (!rule) return;

  const element = root instanceof HTMLElement ? root : root?.[0];
  const host = element?.querySelector?.('.window-content') ?? element;
  if (!host || host.querySelector(`.${CLASS}`)) return;

  const key = attempted.has(ruleKey(rule))
    ? 'HM-BRIDGE.banner-attempted'
    : 'HM-BRIDGE.banner-replaced';
  const banner = document.createElement('p');
  banner.className = CLASS;
  banner.textContent = game.i18n.format(key, {
    item: item.name,
    replacement: rule.replacementName,
  });
  host.prepend(banner);
}

export function registerBanner() {
  Hooks.on('renderApplicationV2', (app, element) => show(app, element));
  Hooks.on('renderItemSheet', (app, html) => show(app, html));
}
