/**
 * state/page-cache.svelte.ts - the last answer each view got, kept until the
 * view asks again.
 *
 * WHY
 *   Every view re-read its data on each visit and drew nothing until the read
 *   came back, so moving between tabs was click, wait, click, wait. Now a
 *   revisit draws the remembered answer at once and refreshes behind it
 *   (stale-while-revalidate). Only the very first visit has to wait.
 *
 * TWO WAYS IN
 *   - `cachedLoad` for a route's `load`. It returns the remembered value
 *     straight away, refetches in the background, then `invalidate`s the route
 *     so the load runs again and picks up the fresh value.
 *   - `peek` / `remember` for pages that fetch in `onMount`, which own their
 *     own loading and refresh logic and just want somewhere to keep the answer.
 *
 * MEMORY ONLY, for the life of the window. A restart reads everything fresh,
 * and nothing here can disagree with the files on disk for longer than one
 * refresh. Anything that changes where data comes from (Settings) calls
 * `forget()` to drop the lot.
 */
import { invalidate } from '$app/navigation';

interface Entry {
  value: unknown;
  /** When the value came back, for the just-refreshed check below. */
  at: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * A background refresh ends by re-running the load, and that run must take
 * the value it just fetched rather than start another refresh. Anything
 * younger than this counts as fresh.
 */
const FRESH_MS = 2000;

// A count, not a flag: two views can refresh at once.
const activity = $state({ refreshing: 0 });

/** What the shell reads to show that something is being re-read. */
export const cacheActivity = {
  get refreshing(): boolean {
    return activity.refreshing > 0;
  },
};

export function peek<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function remember<T>(key: string, value: T): T {
  store.set(key, { value, at: Date.now() });
  return value;
}

/** Drop the given keys, or everything when called with none. */
export function forget(...keys: string[]): void {
  if (!keys.length) store.clear();
  for (const key of keys) store.delete(key);
}

/** Counts a promise toward `cacheActivity.refreshing` until it settles. */
export async function tracked<T>(work: Promise<T>): Promise<T> {
  activity.refreshing++;
  try {
    return await work;
  } finally {
    activity.refreshing--;
  }
}

/** One fetch per key at a time; a second caller shares the first's promise. */
function fetchOnce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const work = fetcher()
    .then((value) => remember(key, value))
    .finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

/**
 * A route `load` that answers from the cache when it can.
 *
 * `depends` is the load event's, so the background refresh can re-run just
 * this route. A failed refresh keeps the old value on screen: stale beats
 * blank, and the next visit tries again.
 */
export async function cachedLoad<T>(
  key: string,
  depends: (...deps: `${string}:${string}`[]) => void,
  fetcher: () => Promise<T>,
): Promise<T> {
  const dep = `cache:${key}` as const;
  depends(dep);

  const hit = store.get(key);
  if (!hit) return fetchOnce(key, fetcher);

  if (Date.now() - hit.at >= FRESH_MS) {
    void tracked(fetchOnce(key, fetcher))
      .then(() => invalidate(dep))
      .catch((e) => console.warn(`Refreshing ${key} failed:`, e));
  }
  return hit.value as T;
}
