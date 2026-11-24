/**
 * settings.js — module configuration.
 *
 * The connection settings are registered with `config: true` so they appear in
 * the normal Configure Settings list (no bespoke form to keep in sync), and one
 * `registerMenu` entry opens the live Status dialog. All settings are world
 * scope and GM-restricted: the bridge exposes compendium contents to an
 * external app, so it isn't a per-player toggle.
 */

import CONSTANTS from './constants.js';
import { invalidateIndex } from './search.js';
import { connect, disconnect, reportState } from './bridge.js';
import BridgeStatus from './status.js';
import CharacterScan from './character-scan.js';
import {
  DEFAULT_MANAGER_URLS,
  LEGACY_DEFAULT_URL,
} from './lib/connection.js';

const { SETTINGS } = CONSTANTS;

export function registerSettings() {
  game.settings.registerMenu(CONSTANTS.MODULE_ID, 'status-menu', {
    name: 'HM-BRIDGE.menu-name',
    label: 'HM-BRIDGE.menu-label',
    hint: 'HM-BRIDGE.menu-hint',
    icon: 'fas fa-tower-broadcast',
    type: BridgeStatus,
    restricted: true,
  });

  game.settings.registerMenu(CONSTANTS.MODULE_ID, 'character-scan-menu', {
    name: 'HM-BRIDGE.scan-title',
    label: 'HM-BRIDGE.scan-button',
    hint: 'HM-BRIDGE.scan-menu-hint',
    icon: 'fas fa-right-left',
    type: CharacterScan,
    restricted: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.MANAGER_URL, {
    name: 'HM-BRIDGE.manager-url-name',
    hint: 'HM-BRIDGE.manager-url-hint',
    scope: 'world',
    config: true,
    type: String,
    default: DEFAULT_MANAGER_URLS,
    onChange: () => {
      // A new target means the old stream is pointing at the wrong place.
      disconnect();
      if (game.settings.get(CONSTANTS.MODULE_ID, SETTINGS.AUTO_CONNECT))
        connect();
    },
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.BRIDGE_TOKEN, {
    name: 'HM-BRIDGE.bridge-token-name',
    hint: 'HM-BRIDGE.bridge-token-hint',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    onChange: () => {
      disconnect();
      if (game.settings.get(CONSTANTS.MODULE_ID, SETTINGS.AUTO_CONNECT))
        connect();
    },
  });

  // Not shown: the manager writes it, and every client reads it to enforce.
  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.RULES, {
    scope: 'world',
    config: false,
    type: String,
    default: '[]',
    onChange: () => reportState(),
  });

  // The switches live here, not in the manager, so the world decides what it
  // enforces. The manager only shows what we report.
  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.ENFORCE, {
    name: 'HM-BRIDGE.enforce-name',
    hint: 'HM-BRIDGE.enforce-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => reportState(),
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.BANNER, {
    name: 'HM-BRIDGE.banner-name',
    hint: 'HM-BRIDGE.banner-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => reportState(),
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.AUTO_CONNECT, {
    name: 'HM-BRIDGE.auto-connect-name',
    hint: 'HM-BRIDGE.auto-connect-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => (value ? connect() : disconnect()),
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.INCLUDE_WORLD, {
    name: 'HM-BRIDGE.include-world-name',
    hint: 'HM-BRIDGE.include-world-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => invalidateIndex(),
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.EXCLUDE_PACKS, {
    name: 'HM-BRIDGE.exclude-packs-name',
    hint: 'HM-BRIDGE.exclude-packs-hint',
    scope: 'world',
    config: true,
    type: String,
    default: '',
    onChange: () => invalidateIndex(),
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.FUZZY, {
    name: 'HM-BRIDGE.fuzzy-name',
    hint: 'HM-BRIDGE.fuzzy-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.FUZZY_THRESHOLD, {
    name: 'HM-BRIDGE.fuzzy-threshold-name',
    hint: 'HM-BRIDGE.fuzzy-threshold-hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.5, max: 1, step: 0.01 },
    default: 0.72,
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.MAX_MATCHES, {
    name: 'HM-BRIDGE.max-matches-name',
    hint: 'HM-BRIDGE.max-matches-hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 1, max: 25, step: 1 },
    default: 8,
  });

  game.settings.register(CONSTANTS.MODULE_ID, SETTINGS.VERBOSE, {
    name: 'HM-BRIDGE.verbose-name',
    hint: 'HM-BRIDGE.verbose-hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });
}

/**
 * 1.0.0 defaulted to the dev server alone, which hid the world from the
 * desktop app. A world still on exactly that value gets the new default, which
 * covers both. Any other value was chosen on purpose and stays. GM only.
 * @returns {Promise<boolean>} true when it changed the setting, whose onChange
 *   has then already reconnected
 */
export async function migrateSettings() {
  const key = SETTINGS.MANAGER_URL;
  const current = String(game.settings.get(CONSTANTS.MODULE_ID, key) ?? '');
  if (current.trim().replace(/\/+$/, '') !== LEGACY_DEFAULT_URL) return false;
  await game.settings.set(CONSTANTS.MODULE_ID, key, DEFAULT_MANAGER_URLS);
  console.info(
    `${CONSTANTS.MODULE_ID} | Homebrew Manager URL updated to "${DEFAULT_MANAGER_URLS}".`,
  );
  return true;
}
