/**
 * Homebrew Manager Bridge — bootstrap.
 *
 * Answers "does my Foundry world already have this homebrew item, and is it
 * finished?" on behalf of the Homebrew Manager. See bridge.js for why the
 * connection runs Foundry → manager rather than the other way round.
 *
 * GM only for the manager connection. Players never open a stream; the
 * settings are world-scope and the status menu is restricted. The replacement
 * hooks (intercept.js, banner.js) run for everyone.
 */

import CONSTANTS from './constants.js';
import { migrateSettings, registerSettings } from './settings.js';
import { connect, disconnect, getState, managerUrls } from './bridge.js';
import { invalidateIndex, buildIndex, runQuery } from './search.js';
import { registerInterceptor } from './intercept.js';
import { warmReplacements } from './replace.js';
import { registerBanner } from './banner.js';
import { registerCharacterScan } from './character-scan.js';

Hooks.once('init', () => {
  registerSettings();
  // Before the sidebar first renders, so its button is there from the start.
  registerCharacterScan();
});

Hooks.once('ready', async () => {
  // Every client enforces the rules; only the GM talks to the manager.
  registerInterceptor();
  registerBanner();

  // The name index is built from data that changes underneath us — a new
  // compendium import, an item edited in the world. These hooks fire for
  // compendium documents as well as world ones, so one set covers both.
  // Items on actors aren't indexed: a Neptunium import adds dozens, and each
  // used to throw the whole index away. Players swap too, so they listen.
  for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
    Hooks.on(hook, (item) => {
      if (!item.parent) invalidateIndex();
    });
  }

  if (!game.user.isGM) return;

  // After the reload's burst of requests, when the server answers quickly.
  if (game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.ENFORCE)) {
    setTimeout(() => {
      warmReplacements().catch((err) =>
        console.warn(`${CONSTANTS.MODULE_ID} | could not preload replacements`, err),
      );
    }, 10_000);
  }

  // A migrated setting reconnects through its own onChange.
  const migrated = await migrateSettings();
  if (
    !migrated &&
    game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.AUTO_CONNECT)
  )
    connect();

  // A small public surface, for macros and for debugging from the console.
  game.modules.get(CONSTANTS.MODULE_ID).api = {
    connect,
    disconnect,
    getState,
    managerUrls,
    buildIndex,
    invalidateIndex,
    runQuery,
  };
});

// Closing the tab should hang up cleanly rather than leaving the manager
// holding a stream it will only notice is dead on the next keepalive.
Hooks.on('closeGame', () => disconnect());
window.addEventListener('beforeunload', () => disconnect());
