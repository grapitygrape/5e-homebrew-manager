/**
 * neptunium-settings.js — apply the manager's Neptunium data source settings
 * to this world, then ask the GM to reload.
 *
 * WHY ASK TO RELOAD
 *   Neptunium reads its config once at load and keeps its own copy. Until the
 *   GM reloads, that copy is what Neptunium uses, and its next save (changing
 *   any Neptunium setting) would write it back over this one.
 */

import { NEPTUNIUM_ID } from './lib/blocklist.js';
import { NEPTUNIUM_CONFIG_KEY, mergeNeptuniumConfig } from './lib/neptunium-config.js';

/** Neptunium's own labels, for the reload dialog. */
const LABELS = {
  isPlayerUseBlocklist: 'Apply World Content Blocklist for Players',
  isGmUseBlocklist: 'Apply World Content Blocklist for GMs',
  isLoadLocalHomebrewIndex: 'Load Local Homebrew',
  localHomebrewDirectoryPath: 'Local Homebrew Directory',
  isUseLocalHomebrewIndexJson: 'Use index.json for Local Homebrew',
  baseSiteUrl: 'Base Site URL',
  baseMediaUrlImg: 'Base Media URL (img)',
  baseMediaUrlAudio: 'Base Media URL (audio)',
  baseMediaUrlFonts: 'Base Media URL (fonts)',
};

/**
 * @param {unknown} settings `{ group: { key: value } }`
 * @returns {Promise<{ updated: string[] }>} the keys that changed
 */
export async function storeNeptuniumSettings(settings) {
  if (!game.modules.get(NEPTUNIUM_ID)?.active)
    throw new Error(game.i18n.localize('HM-BRIDGE.err-blocklist-no-neptunium'));
  if (!game.user.isGM)
    throw new Error(game.i18n.localize('HM-BRIDGE.err-neptunium-not-gm'));
  if (!game.settings.settings.has(`${NEPTUNIUM_ID}.${NEPTUNIUM_CONFIG_KEY}`))
    throw new Error(game.i18n.localize('HM-BRIDGE.err-neptunium-no-config'));

  const current = game.settings.get(NEPTUNIUM_ID, NEPTUNIUM_CONFIG_KEY);
  const { next, changed } = mergeNeptuniumConfig(current, settings);
  if (!changed.length) return { updated: [] };

  await game.settings.set(NEPTUNIUM_ID, NEPTUNIUM_CONFIG_KEY, next);
  // Not awaited: the manager is waiting on the reply, not on the GM.
  void askToReload(changed);
  return { updated: changed.map((c) => c.key) };
}

/** @param {{ key: string, to: unknown }[]} changed */
async function askToReload(changed) {
  const items = changed
    .map((c) => {
      const label = foundry.utils.escapeHTML(LABELS[c.key] ?? c.key);
      const value = foundry.utils.escapeHTML(String(c.to));
      return `<li><strong>${label}</strong>: ${value}</li>`;
    })
    .join('');
  const reload = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('HM-BRIDGE.neptunium-title') },
    content: `<p>${game.i18n.localize('HM-BRIDGE.neptunium-changed')}</p><ul>${items}</ul><p>${game.i18n.localize('HM-BRIDGE.neptunium-reload-hint')}</p>`,
    yes: { label: game.i18n.localize('HM-BRIDGE.neptunium-reload') },
    no: { label: game.i18n.localize('HM-BRIDGE.neptunium-later') },
  }).catch(() => false);
  if (reload) window.location.reload();
}
