import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlocklistBridge, toRule } from '../blocklist.js';
import { fold, loadOpenGroups, matches, OPEN_GROUPS_KEY, saveOpenGroups } from '../picker.js';
import { openShopPicker, pinnedEntries, shownEntries, toShopEntry } from '../shops.js';
import { HTTP_PREFIX, invoke, notReadyMessage, sendPackets } from '../transport.js';

describe('site-browser transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses Tauri IPC when __TAURI_INTERNALS__.invoke is present', async () => {
    const tauriInvoke = vi.fn().mockResolvedValue({ canSend: true, connected: true });
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: { invoke: tauriInvoke },
    });

    const res = await invoke('status', { extra: 1 });
    expect(tauriInvoke).toHaveBeenCalledWith('plugin:site-browser|status', { extra: 1 });
    expect(res).toEqual({ canSend: true, connected: true });
  });

  it('falls back to HTTP POST when __TAURI_INTERNALS__ is absent', async () => {
    vi.stubGlobal('window', {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sent: 2, failed: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await invoke('send', { targetUuid: null, packets: [{ type: 'entity' }] });
    expect(fetchMock).toHaveBeenCalledWith(`${HTTP_PREFIX}send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUuid: null, packets: [{ type: 'entity' }] }),
    });
    expect(res).toEqual({ sent: 2, failed: [] });
  });

  it('throws a descriptive error when HTTP fallback returns non-OK', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Bridge offline',
      }),
    );

    await expect(invoke('status')).rejects.toThrow('Bridge offline');
  });

  it('formats notReadyMessage for disconnected vs outdated bridge', () => {
    expect(notReadyMessage({ connected: false, canSend: false })).toMatch(/No Foundry world/);
    expect(notReadyMessage({ connected: true, canSend: false })).toMatch(/too old to receive sends/);
  });

  it('reports success, partial failure, and transport errors via sendPackets', async () => {
    const toasts: [string, string][] = [];
    const toastFn = (msg: string, type = 'info') => toasts.push([msg, type]);

    await sendPackets(
      'Actor.1',
      'Aria',
      [{ type: 'entity' }],
      vi.fn().mockResolvedValue({ sent: 1, failed: [] }),
      toastFn,
    );
    await sendPackets(
      'Actor.1',
      'Aria',
      [{ type: 'entity' }, { type: 'entity' }],
      vi.fn().mockResolvedValue({ sent: 1, failed: [{ name: 'Bad Item' }] }),
      toastFn,
    );
    await sendPackets(
      null,
      'Foundry',
      [{ type: 'entity' }],
      vi.fn().mockRejectedValue(new Error('timeout')),
      toastFn,
    );

    expect(toasts).toEqual([
      ['Sent it to Aria.', 'success'],
      ['Sent 1 to Aria. Could not send: Bad Item.', 'warning'],
      ['Could not send to Foundry: timeout', 'danger'],
    ]);
  });
});

describe('site-browser blocklist', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes rules and unwraps nested source objects', () => {
    expect(
      toRule({
        displayName: 'Fireball',
        hash: 'fireball_phb',
        category: 'spell',
        source: { source: 'PHB' },
      }),
    ).toEqual({
      displayName: 'Fireball',
      hash: 'fireball_phb',
      category: 'spell',
      source: 'PHB',
      isAuto: false,
    });

    expect(toRule({ displayName: null, hash: 'foo_xphb', category: 'item', source: 'XPHB' })).toEqual(
      {
        displayName: 'foo_xphb',
        hash: 'foo_xphb',
        category: 'item',
        source: 'XPHB',
        isAuto: false,
      },
    );
  });

  it('batches rapid queueBlocked calls and skips incomplete entries', async () => {
    vi.useFakeTimers();
    const invokeFn = vi.fn().mockResolvedValue({});
    const toastFn = vi.fn();
    const bridge = createBlocklistBridge({ batchMs: 100, invokeFn, toastFn });

    bridge.queueBlocked([
      { displayName: 'A', hash: 'a_phb', category: 'spell', source: 'PHB' },
      { displayName: 'Incomplete', hash: '', category: 'spell', source: 'PHB' },
    ]);
    bridge.queueBlocked([{ displayName: 'B', hash: 'b_phb', category: 'spell', source: 'PHB' }]);

    await vi.advanceTimersByTimeAsync(120);

    expect(invokeFn).toHaveBeenCalledTimes(1);
    expect(invokeFn).toHaveBeenCalledWith('blocklist_add', {
      entries: [
        { displayName: 'A', hash: 'a_phb', category: 'spell', source: 'PHB', isAuto: false },
        { displayName: 'B', hash: 'b_phb', category: 'spell', source: 'PHB', isAuto: false },
      ],
    });
    expect(toastFn).toHaveBeenCalledWith(
      "Also sent 2 rules to the manager's Choose Content page. Save there to keep.",
      'success',
    );
  });
});

describe('site-browser shops', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds item and spell shop entries with page-specific metadata', () => {
    let page = 'items.html';
    vi.stubGlobal('UrlUtil', {
      getCurrentPage: () => page,
      autoEncodeHash: (ent: { name: string; source: string }) =>
        `${ent.name.toLowerCase()}_${ent.source.toLowerCase()}`,
    });

    const listPage = {
      _sublistManager: {
        _getCustomHashId: ({ entity }: { entity: { custom?: string } }) => entity.custom ?? null,
        getSublistedEntityMetas: () => [
          { entity: { name: 'Rope', source: 'PHB', value: 100 }, count: 2 },
        ],
      },
      _lastRender: {
        entity: { name: 'Potion', _displayName: 'Healing Potion', source: 'DMG', value: 5000 },
      },
    };

    expect(toShopEntry({ name: 'Sword', source: 'PHB', value: 1500, custom: 'v1' }, 3, listPage)).toEqual(
      {
        h: 'sword_phb',
        c: 3,
        name: 'Sword',
        source: 'PHB',
        customHashId: 'v1',
        value: 1500,
      },
    );
    expect(shownEntries(listPage)).toEqual([
      { h: 'potion_dmg', c: 1, name: 'Healing Potion', source: 'DMG', value: 5000 },
    ]);
    expect(pinnedEntries(listPage)).toEqual([
      { h: 'rope_phb', c: 2, name: 'Rope', source: 'PHB', value: 100 },
    ]);

    page = 'spells.html';
    expect(toShopEntry({ name: 'Shield', source: 'PHB', level: 1, value: 999 }, 1, null)).toEqual({
      h: 'shield_phb',
      c: 1,
      name: 'Shield',
      source: 'PHB',
      page: 'spells.html',
      level: 1,
    });
  });

  it('openShopPicker ignores empty arrays and reports shop_list errors', async () => {
    const show = vi.fn();
    const invokeFn = vi.fn().mockRejectedValue(new Error('disk full'));
    const toastFn = vi.fn();

    await openShopPicker([], show, invokeFn, toastFn);
    expect(invokeFn).not.toHaveBeenCalled();

    await openShopPicker([{ h: 'rope_phb', c: 1 }], show, invokeFn, toastFn);
    expect(show).not.toHaveBeenCalled();
    expect(toastFn).toHaveBeenCalledWith("Could not read the manager's shops: disk full", 'danger');
  });
});

describe('site-browser picker helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('folds accents and matches multi-word queries across name and folder', () => {
    expect(fold('Áriá Stórm')).toBe('aria storm');
    expect(matches({ name: 'Áriá', folder: 'Party Alpha' }, 'aria alpha')).toBe(true);
    expect(matches({ name: 'Áriá', folder: 'Party Alpha' }, 'aria beta')).toBe(false);
    expect(matches({ name: 'Goblin' }, '')).toBe(true);
  });

  it('round-trips open groups and survives corrupt storage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });

    saveOpenGroups(new Set(['character', 'party']));
    expect([...loadOpenGroups()]).toEqual(['character', 'party']);

    store.set(OPEN_GROUPS_KEY, '{not-json');
    expect([...loadOpenGroups()]).toEqual([]);
  });
});
