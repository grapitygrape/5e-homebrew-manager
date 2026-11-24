/**
 * The Foundry bridge store's contract: one polling loop feeds reactive status
 * and both auto-sync hooks (replacement rules and Neptunium settings), pauses
 * while hidden, and cleans up cleanly on stop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BRIDGE_FEATURES, type BridgeClientInfo } from '$lib/engine/foundry/types.ts';
import type { FoundryStatus } from '$lib/api';

const getFoundryStatus = vi.fn<(signal?: AbortSignal) => Promise<FoundryStatus>>();
const getSupersessions = vi.fn();
const sendRulesToFoundry = vi.fn();
const sendNeptuniumSettings = vi.fn();

vi.mock('$lib/api', () => ({
  getFoundryStatus,
  getSupersessions,
  sendRulesToFoundry,
  sendNeptuniumSettings,
}));

const {
  EMPTY_STATUS,
  foundry,
  refreshFoundryStatus,
  resetFoundryState,
  resyncRules,
  startFoundryBridge,
} = await import('./foundry.svelte.ts');

function makeClient(overrides: Partial<BridgeClientInfo> = {}): BridgeClientInfo {
  return {
    clientId: 'client-1',
    world: 'Test World',
    worldId: 'test-world',
    system: 'dnd5e',
    systemVersion: '4.0.0',
    foundryVersion: '12.331',
    user: 'Gamemaster',
    connectedAt: 1,
    origin: 'http://localhost:30000',
    moduleVersion: '1.5.0',
    features: [BRIDGE_FEATURES.rules, BRIDGE_FEATURES.neptunium],
    ...overrides,
  };
}

function makeStatus(clients: BridgeClientInfo[] = []): FoundryStatus {
  return {
    connected: clients.length > 0,
    clients,
    allowedOrigins: [],
    refused: [],
  };
}

const SAMPLE_SUPERSESSIONS = {
  fileExists: true,
  rows: [
    {
      prop: 'spell',
      source: 'PHB',
      hash: 'shield_phb',
      displayName: 'Shield',
      replacedBy: [{ uid: 'deflection|hb', prop: 'spell' }],
    },
  ],
};

function makeFakeDocument(initialHidden = false) {
  let hidden = initialHidden;
  const listeners = new Set<() => void>();
  return {
    get hidden() {
      return hidden;
    },
    setHidden(next: boolean) {
      hidden = next;
      for (const fn of listeners) fn();
    },
    addEventListener(event: string, fn: () => void) {
      if (event === 'visibilitychange') listeners.add(fn);
    },
    removeEventListener(event: string, fn: () => void) {
      if (event === 'visibilitychange') listeners.delete(fn);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetFoundryState();
  getFoundryStatus.mockReset().mockResolvedValue(makeStatus());
  getSupersessions.mockReset().mockResolvedValue(SAMPLE_SUPERSESSIONS);
  sendRulesToFoundry.mockReset().mockResolvedValue({ ok: true });
  sendNeptuniumSettings.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  resetFoundryState();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('foundry store', () => {
  it('starts unloaded with EMPTY_STATUS and updates on refresh', async () => {
    expect(foundry.loaded).toBe(false);
    expect(foundry.status).toEqual(EMPTY_STATUS);

    const world = makeClient();
    getFoundryStatus.mockResolvedValueOnce(makeStatus([world]));

    const status = await refreshFoundryStatus();
    expect(foundry.loaded).toBe(true);
    expect(status.connected).toBe(true);
    expect(foundry.status.clients).toEqual([world]);
  });

  it('turns status fetch failures into disconnected status with error text', async () => {
    getFoundryStatus.mockRejectedValueOnce(new Error('bridge offline'));

    const status = await refreshFoundryStatus();
    expect(foundry.loaded).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.error).toBe('bridge offline');
    expect(foundry.status.error).toBe('bridge offline');
  });

  it('polls on one interval, pauses while hidden, and resumes on visibilitychange without stacking timers', async () => {
    const fakeDoc = makeFakeDocument(false);
    vi.stubGlobal('document', fakeDoc);

    const stop = startFoundryBridge(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getFoundryStatus).toHaveBeenCalledTimes(1);
    expect(fakeDoc.listenerCount).toBe(1);

    // One interval passes -> second poll.
    await vi.advanceTimersByTimeAsync(5000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(2);

    // Hide the tab: no further polls while hidden.
    fakeDoc.setHidden(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(2);

    // Show the tab: polls immediately once, then returns to 5s cadence.
    fakeDoc.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(getFoundryStatus).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(4);

    // Rapid visibility toggle doesn't create duplicate timers.
    fakeDoc.setHidden(true);
    fakeDoc.setHidden(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(getFoundryStatus).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(6);

    stop();
    expect(fakeDoc.listenerCount).toBe(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(6);
  });

  it('replaces any previous loop when startFoundryBridge is called again', async () => {
    const fakeDoc = makeFakeDocument(false);
    vi.stubGlobal('document', fakeDoc);

    startFoundryBridge(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getFoundryStatus).toHaveBeenCalledTimes(1);

    const stopSecond = startFoundryBridge(5000);
    await vi.advanceTimersByTimeAsync(0);
    expect(getFoundryStatus).toHaveBeenCalledTimes(2);
    expect(fakeDoc.listenerCount).toBe(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getFoundryStatus).toHaveBeenCalledTimes(3);

    stopSecond();
  });

  it('syncs rules once per connection, retries failures, and re-sends on resyncRules()', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeClient({ clientId: 'c1', features: [BRIDGE_FEATURES.rules] });
    getFoundryStatus.mockResolvedValue(makeStatus([world]));

    // First send fails -> stays unsent.
    sendRulesToFoundry.mockRejectedValueOnce(new Error('timeout'));
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendRulesToFoundry).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();

    // Next poll retries and succeeds.
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendRulesToFoundry).toHaveBeenCalledTimes(2);

    // Subsequent poll does not re-send to the same clientId.
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendRulesToFoundry).toHaveBeenCalledTimes(2);

    // resyncRules() pushes again after Save.
    await resyncRules();
    expect(sendRulesToFoundry).toHaveBeenCalledTimes(3);

    warn.mockRestore();
  });

  it('syncs Neptunium settings once per connection and does not retry failed worlds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withNep = makeClient({
      clientId: 'c-nep',
      features: [BRIDGE_FEATURES.neptunium],
    });
    const withoutNep = makeClient({
      clientId: 'c-plain',
      features: [BRIDGE_FEATURES.open],
    });
    getFoundryStatus.mockResolvedValue(makeStatus([withNep, withoutNep]));

    sendNeptuniumSettings.mockRejectedValueOnce(new Error('Neptunium not installed'));
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendNeptuniumSettings).toHaveBeenCalledTimes(1);
    expect(sendNeptuniumSettings).toHaveBeenCalledWith('c-nep');

    // Does not retry c-nep on the next poll.
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendNeptuniumSettings).toHaveBeenCalledTimes(1);

    // A reconnect with a new clientId gets synced once.
    const reconnected = makeClient({
      clientId: 'c-nep-2',
      features: [BRIDGE_FEATURES.neptunium],
    });
    getFoundryStatus.mockResolvedValue(makeStatus([reconnected]));
    await refreshFoundryStatus();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendNeptuniumSettings).toHaveBeenCalledTimes(2);
    expect(sendNeptuniumSettings).toHaveBeenLastCalledWith('c-nep-2');

    warn.mockRestore();
  });
});
