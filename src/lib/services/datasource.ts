/**
 * lib/services/datasource.ts — the one shared DataSource instance.
 *
 * INTENT
 *   Build the DataSource once from the *effective* config (stored overrides +
 *   env/defaults) and reuse it. Config comes from the registered provider
 *   (config.ts), so this runs on the Node server and in the Tauri webview.
 *   getDataSource() stays sync, so callers are unchanged.
 *
 * RESET
 *   `resetDataSource()` runs after a Settings save, or in the desktop shell when
 *   hbm-config.json changes on disk. It drops the instance and every downstream
 *   cache. Services register their own reset with `onDataSourceReset()` (or
 *   `cachedResource()`) when they load, rather than this module importing them,
 *   so a browser bundle that pulls in this file doesn't drag in the server-only
 *   services too. A service that hasn't loaded has nothing cached, so missing
 *   it is harmless.
 */
import { createDataSource } from '$lib/data';
import type { DataSource } from '$lib/data';
import { configProvider } from './config';

let instance: DataSource | null = null;
const resetHooks = new Set<() => void>();

export function getDataSource(): DataSource {
  if (!instance) {
    const provider = configProvider();
    instance = createDataSource(provider.effectiveConfig(), {
      root: provider.root(),
    });
  }
  return instance;
}

/** Run `reset` whenever the DataSource is dropped. */
export function onDataSourceReset(reset: () => void): void {
  resetHooks.add(reset);
}

/** Drop the DataSource + all downstream caches (after a config change). */
export function resetDataSource(): void {
  instance = null;
  for (const reset of resetHooks) reset();
}

export interface CachedResource<T> {
  /** Return the cached value, running `loader` once (deduping concurrent callers). Pass `force = true` to reload. */
  get(force?: boolean): Promise<T>;
  /** Drop any cached value and detach any in-flight load. */
  reset(): void;
  /** True once a value has resolved and is currently cached. */
  isReady(): boolean;
}

/**
 * Memoize a DataSource-derived value with in-flight promise deduplication and
 * automatic invalidation on `resetDataSource()`.
 */
export function cachedResource<T>(
  loader: () => T | Promise<T>,
): CachedResource<T> {
  let hasValue = false;
  let value: T | undefined;
  let inFlight: Promise<T> | null = null;
  // Generation counter so a load started before `reset()` cannot populate the
  // cache or clear a newer in-flight load when it settles later.
  let gen = 0;

  const reset = (): void => {
    gen++;
    hasValue = false;
    value = undefined;
    inFlight = null;
  };
  onDataSourceReset(reset);

  const get = (force = false): Promise<T> => {
    if (force) reset();
    if (hasValue) return Promise.resolve(value as T);
    if (!inFlight) {
      const myGen = gen;
      const p = Promise.resolve()
        .then(loader)
        .then((result) => {
          if (gen === myGen) {
            value = result;
            hasValue = true;
          }
          return result;
        })
        .finally(() => {
          if (gen === myGen) inFlight = null;
        });
      inFlight = p;
    }
    return inFlight;
  };

  return { get, reset, isReady: () => hasValue };
}
