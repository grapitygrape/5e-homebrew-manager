/**
 * status.js — the "is this thing on?" dialog.
 *
 * Subscribes to the bridge's state so the light updates live while the dialog
 * is open (connecting → connected → busy during a check). Also the place to
 * force a reconnect, run a one-shot reachability test, and rebuild the search
 * index after bulk-importing a compendium.
 */

import {
  connect,
  disconnect,
  getState,
  managerUrls,
  onStateChange,
  testConnection,
} from './bridge.js';
import { buildIndex, invalidateIndex } from './search.js';

const { ApplicationV2 } = foundry.applications.api;

function escapeHTML(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STATE_ICON = {
  disconnected: 'fa-plug-circle-xmark',
  connecting: 'fa-spinner fa-spin',
  connected: 'fa-plug-circle-check',
  busy: 'fa-spinner fa-spin',
  refused: 'fa-hand',
  offline: 'fa-plug-circle-minus',
  error: 'fa-plug-circle-exclamation',
};

export default class BridgeStatus extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'foundry-homebrew-bridge-status',
    tag: 'div',
    classes: ['hm-bridge'],
    window: {
      title: 'HM-BRIDGE.status-title',
      icon: 'fas fa-tower-broadcast',
      resizable: true,
    },
    position: { width: 460, height: 'auto' },
  };

  /** @type {(() => void)|null} */
  #unsubscribe = null;

  async _onFirstRender(...args) {
    await super._onFirstRender?.(...args);
    // Re-render on every bridge state change so the light is never stale.
    this.#unsubscribe = onStateChange(() => this.render());
  }

  async close(options) {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    return super.close(options);
  }

  async _renderHTML() {
    const s = getState();
    const label = game.i18n.localize(`HM-BRIDGE.state-${s.status}`);
    const check = s.lastCheck;
    const urls = s.connections.length
      ? s.connections
      : managerUrls().map((url) => ({
          url,
          status: 'disconnected',
          clientId: null,
          message: '',
        }));

    // One line per manager: which one is live, and why the others aren't.
    const connectionRows = urls
      .map(
        (c) => `
        <li class="hm-bridge-conn hm-bridge-${escapeHTML(c.status)}">
          <i class="fas ${STATE_ICON[c.status] ?? 'fa-plug'}"></i>
          <code>${escapeHTML(c.url)}</code>
          <b>${escapeHTML(game.i18n.localize(`HM-BRIDGE.state-${c.status}`))}</b>
          ${c.message ? `<p class="hm-bridge-message">${escapeHTML(c.message)}</p>` : ''}
        </li>`,
      )
      .join('');

    const lastCheckRow = check
      ? `<div class="hm-bridge-row">
           <span>${game.i18n.localize('HM-BRIDGE.last-check')}</span>
           <b>${game.i18n.format('HM-BRIDGE.last-check-value', {
             found: check.found,
             asked: check.asked,
             ms: check.elapsedMs,
           })}</b>
         </div>`
      : '';

    return `
      <div class="hm-bridge-state hm-bridge-${escapeHTML(s.status)}">
        <i class="fas ${STATE_ICON[s.status] ?? 'fa-plug'}"></i>
        <span>${escapeHTML(label)}</span>
      </div>

      <ul class="hm-bridge-conns">
        ${connectionRows || `<li class="hm-bridge-message">${escapeHTML(game.i18n.localize('HM-BRIDGE.err-no-url'))}</li>`}
      </ul>

      <div class="hm-bridge-rows">
        <div class="hm-bridge-row">
          <span>${game.i18n.localize('HM-BRIDGE.world')}</span>
          <b>${escapeHTML(game.world?.title ?? '—')}</b>
        </div>
        <div class="hm-bridge-row">
          <span>${game.i18n.localize('HM-BRIDGE.origin')}</span>
          <code>${escapeHTML(window.location.origin)}</code>
        </div>
        ${lastCheckRow}
      </div>

      <p class="hint">${game.i18n.localize('HM-BRIDGE.status-hint')}</p>

      <footer class="form-footer hm-bridge-actions">
        <button type="button" data-action="test"><i class="fas fa-satellite-dish"></i> ${game.i18n.localize('HM-BRIDGE.test')}</button>
        <button type="button" data-action="reindex"><i class="fas fa-rotate"></i> ${game.i18n.localize('HM-BRIDGE.reindex')}</button>
        <button type="button" data-action="connect"><i class="fas fa-plug"></i> ${game.i18n.localize(s.status === 'disconnected' ? 'HM-BRIDGE.connect' : 'HM-BRIDGE.reconnect')}</button>
        ${
          s.status === 'disconnected'
            ? ''
            : `<button type="button" data-action="disconnect"><i class="fas fa-plug-circle-xmark"></i> ${game.i18n.localize('HM-BRIDGE.disconnect')}</button>`
        }
      </footer>`;
  }

  async _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (ev) => this.#onAction(ev));
    });
  }

  async #onAction(ev) {
    const button = ev.currentTarget;
    const action = button.dataset.action;

    if (action === 'connect') return connect({ manual: true });
    if (action === 'disconnect') return disconnect();

    if (action === 'test') {
      button.disabled = true;
      const results = await testConnection();
      button.disabled = false;
      if (!results.length)
        ui.notifications.warn(game.i18n.localize('HM-BRIDGE.err-no-url'));
      for (const r of results) {
        if (r.kind === 'ok')
          ui.notifications.info(
            game.i18n.format('HM-BRIDGE.test-ok', { url: r.url }),
          );
        else
          ui.notifications.warn(
            game.i18n.format('HM-BRIDGE.test-fail', {
              url: r.url,
              error: r.message,
            }),
          );
      }
      return;
    }

    if (action === 'reindex') {
      button.disabled = true;
      invalidateIndex();
      const { entries, packs } = await buildIndex();
      button.disabled = false;
      ui.notifications.info(
        game.i18n.format('HM-BRIDGE.reindexed', {
          entries: entries.length,
          packs,
        }),
      );
    }
  }
}
