/**
 * blocklist.js — write the manager's content blocklist into Neptunium's World
 * Content Blocklist. See lib/blocklist.js for why the file alone isn't enough.
 */

import {
  NEPTUNIUM_BLOCKLIST_KEY,
  NEPTUNIUM_ID,
  mergeWorldBlocklist,
} from './lib/blocklist.js';

/**
 * Replace the world's blocklist with the manager's rules. Skips the write when
 * nothing changed, so a repeat deploy doesn't nag the GM.
 * @param {unknown[]} rules
 * @returns {Promise<{ count: number, changed: boolean }>}
 */
export async function storeBlocklist(rules) {
  if (!Array.isArray(rules)) throw new Error('No blocklist rules were sent.');
  if (!game.modules.get(NEPTUNIUM_ID)?.active)
    throw new Error(game.i18n.localize('HM-BRIDGE.err-blocklist-no-neptunium'));
  if (!game.user.isGM)
    throw new Error(game.i18n.localize('HM-BRIDGE.err-blocklist-not-gm'));
  // Registered in Neptunium's init. Missing means a Neptunium that moved it.
  if (!game.settings.settings.has(`${NEPTUNIUM_ID}.${NEPTUNIUM_BLOCKLIST_KEY}`))
    throw new Error(game.i18n.localize('HM-BRIDGE.err-blocklist-no-setting'));

  const current = game.settings.get(NEPTUNIUM_ID, NEPTUNIUM_BLOCKLIST_KEY) ?? [];
  const next = mergeWorldBlocklist(rules, current);
  if (JSON.stringify(next) === JSON.stringify(current))
    return { count: next.length, changed: false };

  await game.settings.set(NEPTUNIUM_ID, NEPTUNIUM_BLOCKLIST_KEY, next);
  // Neptunium reads the setting once at load; this updates the copy its
  // importers filter with, so the GM's tab is right without a reload.
  await globalThis.ExcludeUtil?.pSetList?.(structuredClone(next));
  ui.notifications.info(
    game.i18n.format('HM-BRIDGE.blocklist-updated', { n: next.length }),
  );
  return { count: next.length, changed: true };
}
