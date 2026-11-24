/**
 * state/foundry.svelte.ts — single Foundry bridge polling loop, shared reactive
 * status, and per-connection auto-sync hooks (replacement mappings and
 * Neptunium settings).
 *
 * WHY ONE STORE
 *   Previously the layout ran two 10s sync loops while each page or modal that
 *   showed Foundry status ran its own 5s/3s loop. One shared loop started once
 *   in `+layout.svelte` keeps every view in sync, feeds both auto-sync hooks
 *   from the same poll, and pauses cleanly while the tab is hidden.
 *
 * AUTO-SYNC
 *   - Replacement mappings (`rules`): sent once per connected world, and again
 *     after Save via `resyncRules()`. Failed sends stay unsent so the next poll
 *     retries.
 *   - Neptunium data source settings (`neptunium`): sent once per newly
 *     connected world that advertises the feature. Failures are marked sent too
 *     — a world without Neptunium says so every time, so retrying on every poll
 *     would only spam the console.
 */
import {
  getFoundryStatus,
  getSupersessions,
  sendNeptuniumSettings,
  sendRulesToFoundry,
  type FoundryStatus,
} from '$lib/api';
import {
  rulesToSync,
  worldsNeedingRules,
} from '$lib/engine/foundry/replacements.ts';
import {
  BRIDGE_FEATURES,
  type BridgeClientInfo,
} from '$lib/engine/foundry/types.ts';

export type BridgeStatus = FoundryStatus;

export const EMPTY_STATUS: BridgeStatus = {
  connected: false,
  clients: [],
  allowedOrigins: [],
  refused: [],
};

const state = $state<{
  status: BridgeStatus;
  loaded: boolean;
}>({
  status: { ...EMPTY_STATUS },
  loaded: false,
});

/** Reactive bridge status read by any view or modal. */
export const foundry = {
  get status(): BridgeStatus {
    return state.status;
  },
  /** False until the first poll finishes, so the dashboard can show "Checking…". */
  get loaded(): boolean {
    return state.loaded;
  },
};

/** Worlds that already hold the saved replacement list, by clientId. */
const rulesSent = new Set<string>();
let rulesRunning = false;
let rulesGeneration = 0;

/** Worlds already sent Neptunium settings, by clientId. */
const neptuniumSent = new Set<string>();
let neptuniumRunning = false;

/** Active polling loop stop handle, so at most one loop runs at a time. */
let stopActive: (() => void) | null = null;

function pruneDisconnected(
  sent: Set<string>,
  clients: BridgeClientInfo[],
): void {
  // A reconnect gets a new clientId, so ids that went away are only clutter.
  const live = new Set(clients.map((c) => c.clientId));
  for (const id of sent) if (!live.has(id)) sent.delete(id);
}

async function syncRules(clients: BridgeClientInfo[]): Promise<void> {
  pruneDisconnected(rulesSent, clients);

  const waiting = worldsNeedingRules(clients, rulesSent);
  if (!waiting.length || rulesRunning) return;
  rulesRunning = true;
  const gen = rulesGeneration;
  try {
    const rules = rulesToSync(await getSupersessions());
    if (!rules) return;
    for (const world of waiting) {
      try {
        await sendRulesToFoundry(world.clientId, rules);
        if (gen === rulesGeneration) rulesSent.add(world.clientId);
      } catch (e) {
        // Tried again on the next poll.
        console.warn(`Could not send mappings to ${world.world}:`, e);
      }
    }
  } catch (e) {
    console.warn('Could not read the mappings to send to Foundry:', e);
  } finally {
    rulesRunning = false;
  }
}

async function syncNeptunium(clients: BridgeClientInfo[]): Promise<void> {
  pruneDisconnected(neptuniumSent, clients);

  const waiting = clients.filter(
    (c) =>
      (c.features ?? []).includes(BRIDGE_FEATURES.neptunium) &&
      !neptuniumSent.has(c.clientId),
  );
  if (!waiting.length || neptuniumRunning) return;
  neptuniumRunning = true;
  try {
    for (const world of waiting) {
      try {
        await sendNeptuniumSettings(world.clientId);
        neptuniumSent.add(world.clientId);
      } catch (e) {
        // A world without Neptunium says so every time; don't retry it.
        neptuniumSent.add(world.clientId);
        console.warn(`Could not set Neptunium settings in ${world.world}:`, e);
      }
    }
  } finally {
    neptuniumRunning = false;
  }
}

/** One status poll. Never throws — a failed poll is just "not connected". */
async function fetchStatus(signal?: AbortSignal): Promise<BridgeStatus> {
  try {
    return await getFoundryStatus(signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { ...EMPTY_STATUS };
    return { ...EMPTY_STATUS, error: (e as Error).message };
  }
}

function applyStatus(next: BridgeStatus): {
  status: BridgeStatus;
  rules: Promise<void>;
  neptunium: Promise<void>;
} {
  // Fresh object each poll so effects reacting to `foundry.status` re-run on
  // every tick (e.g. FoundryScanModal retrying a silent world).
  const snapshot: BridgeStatus = { ...next };
  state.status = snapshot;
  state.loaded = true;
  return {
    status: snapshot,
    rules: syncRules(snapshot.clients),
    neptunium: syncNeptunium(snapshot.clients),
  };
}

/** Poll once right now, update the shared store, and return the fresh status. */
export async function refreshFoundryStatus(
  signal?: AbortSignal,
): Promise<BridgeStatus> {
  const next = await fetchStatus(signal);
  if (signal?.aborted) return next;
  return applyStatus(next).status;
}

/**
 * Start the single bridge polling loop for the app's lifetime.
 * Pauses while the tab is hidden and polls immediately when visible again.
 * Calling again replaces any running loop. Returns a stop function.
 */
export function startFoundryBridge(intervalMs = 5000): () => void {
  stopActive?.();

  let stopped = false;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  const doc = typeof document !== 'undefined' ? document : null;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = () => {
    clearTimer();
    if (!stopped && !doc?.hidden) {
      timer = setTimeout(() => void tick(), intervalMs);
    }
  };

  const tick = async () => {
    if (stopped || inFlight || doc?.hidden) return;
    clearTimer();
    inFlight = true;
    try {
      await refreshFoundryStatus(controller.signal);
    } finally {
      inFlight = false;
    }
    schedule();
  };

  const onVisible = () => {
    if (!doc?.hidden) void tick();
  };

  void tick();
  doc?.addEventListener('visibilitychange', onVisible);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer();
    controller.abort();
    doc?.removeEventListener('visibilitychange', onVisible);
    if (stopActive === stop) stopActive = null;
  };
  stopActive = stop;
  return stop;
}

/** After Save: send the new replacement list to every connected world now. */
export async function resyncRules(): Promise<void> {
  rulesGeneration++;
  rulesSent.clear();
  const next = await fetchStatus();
  await applyStatus(next).rules;
}

/** Reset store state and stop polling (for tests). */
export function resetFoundryState(): void {
  stopActive?.();
  state.status = { ...EMPTY_STATUS };
  state.loaded = false;
  rulesSent.clear();
  rulesRunning = false;
  rulesGeneration = 0;
  neptuniumSent.clear();
  neptuniumRunning = false;
}
