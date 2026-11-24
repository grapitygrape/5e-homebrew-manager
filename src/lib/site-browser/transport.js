// Transport bridge between the injected site-browser script and the manager.
// Uses Tauri plugin IPC in the desktop window, falling back to same-origin HTTP
// when running in a plain browser (container preview mode).

export const HTTP_PREFIX = '/_hm-site-browser/';

export const invoke = async (cmd, args) => {
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__?.invoke) {
    return window.__TAURI_INTERNALS__.invoke(`plugin:site-browser|${cmd}`, args);
  }
  const res = await fetch(`${HTTP_PREFIX}${cmd}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Site browser request failed (${res.status})`);
  }
  return res.json();
};

export const toast = (content, type = 'info') => {
  if (typeof JqueryUtil !== 'undefined') JqueryUtil.doToast({ content, type });
};

export const notReadyMessage = (status) =>
  status.connected
    ? "This world's Homebrew Manager Bridge module is too old to receive sends. Update it from the manager and reload the world."
    : 'No Foundry world is connected. Open your world as a GM, then try again.';

export const markPage = (status) => {
  const root = document.documentElement;
  if (root) root.dataset.hbmFoundry = status.canSend ? 'on' : 'off';
};

export const pollStatus = async (state, invokeFn = invoke) => {
  if (document.hidden) return;
  try {
    state.status = await invokeFn('status');
  } catch {
    // A page off the site can't reach the app, which reads as not connected.
    state.status = { canSend: false, connected: false };
  }
  markPage(state.status);
};

export const sendPackets = async (targetUuid, name, packets, invokeFn = invoke, toastFn = toast) => {
  try {
    const { sent, failed } = await invokeFn('send', { targetUuid, packets });
    if (failed?.length) {
      const names = failed.map((f) => f.name).join(', ');
      toastFn(`Sent ${sent} to ${name}. Could not send: ${names}.`, 'warning');
    } else {
      const what = packets.length > 1 ? `${packets.length} entries` : 'it';
      toastFn(`Sent ${what} to ${name}.`, 'success');
    }
  } catch (err) {
    toastFn(`Could not send to Foundry: ${err?.message ?? err}`, 'danger');
  }
};
