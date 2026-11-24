/**
 * bridge.js — the outbound connections to the Homebrew Manager.
 *
 * WHY OUTBOUND
 *   A Foundry module is client-side ESM. It runs in the browser tab, not in
 *   Foundry's Node process, and Foundry publishes no HTTP API for compendium
 *   contents (v11+ packs are server-side LevelDB behind an authenticated
 *   socket). The manager therefore cannot call Foundry. This module calls the
 *   manager instead and holds an SSE stream open; the manager pushes work down
 *   it and we POST answers back. "Foundry must be running with a world open"
 *   falls out of that for free — no world, no stream, button greyed out.
 *
 * ONE CONNECTION PER MANAGER URL
 *   The setting lists one or more managers (by default the desktop app and the
 *   dev server; see lib/connection.js). Each gets its own stream, state and
 *   retry timer, so a manager that isn't running never holds up one that is.
 *
 * LIFECYCLE (per URL)
 *   open() → EventSource → `hello` (we learn our clientId) → idle, with `ping`
 *   keepalives → `query` / `command` → POST /api/foundry/result. On any error
 *   we close the stream ourselves and probe /api/foundry/status to learn why:
 *   refused (origin not allowlisted), offline (nothing listening), or other.
 *   That decides the message and the retry pace. Letting EventSource retry on
 *   its own would hammer a stopped manager every few seconds forever.
 *
 * SECURITY
 *   The manager only accepts a stream whose Origin is in its own configured
 *   Foundry URL list. Point the setting at managers you control.
 */

import CONSTANTS from './constants.js';
import { runQuery } from './search.js';
import { runScan } from './scan.js';
import { runReplace, storeRules } from './replace.js';
import { listTargets, runSend } from './send.js';
import { storeBlocklist } from './blocklist.js';
import { storeNeptuniumSettings } from './neptunium-settings.js';
import { parseRules } from './lib/replacements.js';
import {
  aggregateStatus,
  parseManagerUrls,
  readProbe,
  retryDelay,
} from './lib/connection.js';

/** @typedef {'connecting'|'connected'|'busy'|'refused'|'offline'|'error'} ConnStatus */

/**
 * @typedef {object} Connection
 * @property {string} url
 * @property {ConnStatus} status
 * @property {string|null} clientId
 * @property {string} message
 * @property {number} failures
 * @property {EventSource|null} source
 * @property {ReturnType<typeof setTimeout>|null} retryTimer
 */

/** What the handshake advertises; the manager gates UI on these. */
const FEATURES = ['open', 'scan', 'replace', 'rules', 'send', 'blocklist', 'neptunium'];

const listeners = new Set();

/** @type {Map<string, Connection>} */
const connections = new Map();

let lastCheck = null;
/** Set while the user has explicitly disconnected, so we don't auto-retry. */
let stopped = false;
/** URLs we've already warned about this session, so a refusal toasts once. */
const warned = new Set();

/** A snapshot for the status dialog and the console API. */
export function getState() {
  const list = [...connections.values()].map((c) => ({
    url: c.url,
    status: c.status,
    clientId: c.clientId,
    message: c.message,
  }));
  return {
    status: aggregateStatus(list.map((c) => c.status)),
    connections: list,
    lastCheck,
  };
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const state = getState();
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error(`${CONSTANTS.MODULE_ID} | status listener failed`, err);
    }
  }
  Hooks.callAll(`${CONSTANTS.MODULE_ID}.stateChange`, state);
}

/** @param {Connection} conn @param {Partial<Connection>} patch */
function update(conn, patch) {
  Object.assign(conn, patch);
  emit();
}

const setting = (key) => game.settings.get(CONSTANTS.MODULE_ID, key);

function bridgeToken() {
  try {
    return String(setting(CONSTANTS.SETTINGS.BRIDGE_TOKEN) ?? '').trim();
  } catch {
    return '';
  }
}

function authHeaders() {
  const token = bridgeToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

/** Every manager this world should connect to. */
export function managerUrls() {
  return parseManagerUrls(setting(CONSTANTS.SETTINGS.MANAGER_URL));
}

/** Identify this world to the manager so its UI can show what it's talking to. */
function handshakeParams() {
  const params = new URLSearchParams({
    world: game.world?.title ?? game.world?.id ?? 'unknown',
    worldId: game.world?.id ?? '',
    system: game.system?.id ?? '',
    systemVersion: game.system?.version ?? '',
    foundryVersion: game.version ?? '',
    user: game.user?.name ?? '',
    moduleVersion: game.modules.get(CONSTANTS.MODULE_ID)?.version ?? '',
    features: FEATURES.join(','),
  });
  const token = bridgeToken();
  if (token) params.set('token', token);
  return params;
}

/** Open a stream to every configured manager, replacing any existing ones. */
export function connect({ manual = false } = {}) {
  const urls = managerUrls();
  stopped = false;
  teardownAll();
  if (!urls.length) {
    if (manual)
      ui.notifications.warn(game.i18n.localize('HM-BRIDGE.err-no-url'));
    emit();
    return;
  }
  for (const url of urls) {
    /** @type {Connection} */
    const conn = {
      url,
      status: 'connecting',
      clientId: null,
      message: '',
      failures: 0,
      source: null,
      retryTimer: null,
    };
    connections.set(url, conn);
    open(conn, manual);
  }
  emit();
}

/** Close every stream and stop retrying until the user reconnects. */
export function disconnect() {
  stopped = true;
  teardownAll();
  emit();
}

function teardownAll() {
  for (const conn of connections.values()) teardown(conn);
  connections.clear();
}

/** @param {Connection} conn */
function teardown(conn) {
  if (conn.retryTimer) {
    clearTimeout(conn.retryTimer);
    conn.retryTimer = null;
  }
  if (conn.source) {
    conn.source.onerror = null;
    conn.source.close();
    conn.source = null;
  }
}

/** @param {Connection} conn */
function open(conn, manual = false) {
  teardown(conn);
  update(conn, { status: 'connecting', clientId: null });

  let source;
  try {
    source = new EventSource(
      `${conn.url}/api/foundry/stream?${handshakeParams()}`,
    );
  } catch (err) {
    void diagnose(conn, err?.message ?? String(err));
    return;
  }
  conn.source = source;

  source.addEventListener('hello', (ev) => {
    const data = parse(ev.data);
    warned.delete(conn.url);
    update(conn, {
      status: 'connected',
      clientId: data?.clientId ?? null,
      failures: 0,
      message: '',
    });
    if (manual)
      ui.notifications.info(
        game.i18n.format('HM-BRIDGE.connected-to', { url: conn.url }),
      );
    void postState(conn);
  });

  // Keepalive. Nothing to do but prove the pipe is alive.
  source.addEventListener('ping', () => {});

  source.addEventListener('query', (ev) => {
    const query = parse(ev.data);
    if (query) void handleQuery(conn, query);
  });

  source.addEventListener('command', (ev) => {
    const command = parse(ev.data);
    if (command) void handleCommand(conn, command);
  });

  // EventSource errors carry no detail, so close and ask the manager why.
  source.onerror = () => {
    teardown(conn);
    void diagnose(conn);
  };
}

/**
 * Probe the manager's status endpoint to tell refused from offline, then
 * schedule the next attempt.
 * @param {Connection} conn
 * @param {string} [fallback] a message to use when the probe has nothing better
 */
async function diagnose(conn, fallback) {
  const result = readProbe(await probe(conn.url));
  if (stopped || connections.get(conn.url) !== conn) return;

  const failures = conn.failures + 1;
  const status = result.kind === 'ok' ? 'error' : result.kind;
  let message = result.message || fallback || '';
  if (result.kind === 'ok')
    message = game.i18n.localize('HM-BRIDGE.err-stream-closed');
  if (result.kind === 'offline')
    message = game.i18n.localize('HM-BRIDGE.err-offline');

  if (result.kind === 'refused' && !warned.has(conn.url)) {
    warned.add(conn.url);
    ui.notifications.warn(
      game.i18n.format('HM-BRIDGE.refused-toast', {
        url: conn.url,
        origin: window.location.origin,
      }),
      { permanent: true },
    );
  }

  update(conn, { status, message, failures, clientId: null });
  conn.retryTimer = setTimeout(() => open(conn), retryDelay(status, failures));
}

/** GET /api/foundry/status, without throwing. */
async function probe(url) {
  try {
    const res = await fetch(`${url}/api/foundry/status`, { cache: 'no-store' });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}

function parse(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    console.error(`${CONSTANTS.MODULE_ID} | malformed payload`, json, err);
    return null;
  }
}

/** What this world enforces, for the manager to show. It has no switches of its own. */
function enforcementState() {
  return {
    imports: Boolean(setting(CONSTANTS.SETTINGS.ENFORCE)),
    banner: Boolean(setting(CONSTANTS.SETTINGS.BANNER)),
    rules: parseRules(setting(CONSTANTS.SETTINGS.RULES)).length,
  };
}

/** Tell one manager what this world enforces. A manager too old to listen 404s, which is fine. */
async function postState(conn) {
  if (!conn.clientId) return;
  try {
    await fetch(`${conn.url}/api/foundry/state`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ clientId: conn.clientId, state: enforcementState() }),
    });
  } catch (err) {
    console.warn(`${CONSTANTS.MODULE_ID} | could not report state`, err);
  }
}

/** Tell every connected manager, after a setting changes. No-op off the GM's client. */
export function reportState() {
  for (const conn of connections.values()) {
    if (conn.status === 'connected' || conn.status === 'busy')
      void postState(conn);
  }
}

/** POST an answer back to the manager that asked. */
async function reply(conn, payload) {
  try {
    await fetch(`${conn.url}/api/foundry/result`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ clientId: conn.clientId, ...payload }),
    });
  } catch (err) {
    // The manager went away mid-request. The stream will notice on its own.
    console.error(`${CONSTANTS.MODULE_ID} | could not deliver result`, err);
  }
}

/**
 * Search this world for the manager's candidates and POST the answer back.
 * A failure here is reported as a failed *request*, not a dead connection —
 * the stream stays up so the next check can still run.
 * @param {Connection} conn
 */
async function handleQuery(conn, query) {
  const started = performance.now();
  update(conn, {
    status: 'busy',
    message: game.i18n.format('HM-BRIDGE.checking-n', {
      n: query.candidates?.length ?? 0,
    }),
  });

  let payload;
  try {
    const { results, searched } = await runQuery(query);
    const elapsedMs = Math.round(performance.now() - started);
    payload = { requestId: query.requestId, ok: true, results, searched, elapsedMs };
    const found = results.filter((r) => r.matches.length > 0).length;
    lastCheck = { at: Date.now(), asked: results.length, found, elapsedMs };
    update(conn, { status: 'connected', message: '' });
    if (setting(CONSTANTS.SETTINGS.VERBOSE)) {
      ui.notifications.info(
        game.i18n.format('HM-BRIDGE.check-done', {
          found,
          total: results.length,
          ms: elapsedMs,
        }),
      );
    }
  } catch (err) {
    console.error(`${CONSTANTS.MODULE_ID} | query failed`, err);
    payload = {
      requestId: query.requestId,
      ok: false,
      error: err?.message ?? String(err),
      elapsedMs: Math.round(performance.now() - started),
    };
    update(conn, { status: 'connected', message: payload.error });
  }

  await reply(conn, payload);
}

/**
 * Run an action the manager asked for: open a sheet, scan for replacements, replace one, store the rules, take a send from the site browser, or set Neptunium's blocklist or settings.
 * @param {Connection} conn
 * @param {{ requestId: string, action: string, uuid?: string, rules?: object[], rule?: object, scope?: object, targetUuid?: string|null, packets?: object[] }} command
 */
async function handleCommand(conn, command) {
  let payload;
  try {
    if (command.action === 'ping') {
      // The manager checking this world still answers, before it relies on it.
      payload = { requestId: command.requestId, ok: true };
    } else if (command.action === 'open') {
      const name = await openSheet(command.uuid);
      payload = { requestId: command.requestId, ok: true, name };
    } else if (command.action === 'scan') {
      const { hits, scanned } = await runScan(command);
      payload = { requestId: command.requestId, ok: true, hits, scanned };
    } else if (command.action === 'rules') {
      const count = await storeRules(command.rules);
      payload = { requestId: command.requestId, ok: true, count };
    } else if (command.action === 'replace') {
      const done = await runReplace(command);
      payload = { requestId: command.requestId, ok: true, ...done };
    } else if (command.action === 'sendTargets') {
      payload = { requestId: command.requestId, ok: true, targets: listTargets(command) };
    } else if (command.action === 'send') {
      const done = await runSend(command);
      payload = { requestId: command.requestId, ok: true, ...done };
    } else if (command.action === 'blocklist') {
      const done = await storeBlocklist(command.rules);
      payload = { requestId: command.requestId, ok: true, ...done };
    } else if (command.action === 'neptunium') {
      const done = await storeNeptuniumSettings(command.settings);
      payload = { requestId: command.requestId, ok: true, ...done };
    } else {
      throw new Error(`Unknown command "${command.action}".`);
    }
  } catch (err) {
    payload = {
      requestId: command.requestId,
      ok: false,
      error: err?.message ?? String(err),
    };
  }
  await reply(conn, payload);
}

/** Open a document's sheet and pull it to the front. Returns its name. */
async function openSheet(uuid) {
  const doc = await fromUuid(String(uuid ?? ''));
  if (!doc) throw new Error(game.i18n.format('HM-BRIDGE.err-no-doc', { uuid }));
  const sheet = doc.sheet;
  if (!sheet) throw new Error(game.i18n.format('HM-BRIDGE.err-no-sheet', { name: doc.name }));

  // render(true) forces it open on both ApplicationV1 and V2 sheets.
  await sheet.render(true);
  if (sheet.minimized) await sheet.maximize?.();
  if (sheet.bringToFront) sheet.bringToFront();
  else sheet.bringToTop?.();
  ui.notifications.info(game.i18n.format('HM-BRIDGE.opened', { name: doc.name }));
  // Browsers usually ignore this from a background tab; the desktop client honours it.
  window.focus();
  return doc.name;
}

/** Probe every configured manager, for the "Test connection" button. */
export async function testConnection() {
  const urls = managerUrls();
  return Promise.all(
    urls.map(async (url) => ({ url, ...readProbe(await probe(url)) })),
  );
}
