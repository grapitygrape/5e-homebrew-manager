/**
 * state/busy-set.svelte.ts — reactive per-key busy-state tracker for async row
 * actions. Replaces manual `new Set(s).add(k)` / `try ... finally { delete }`
 * boilerplate across list views.
 */
export class BusySet<K = string> {
  #keys = $state(new Set<K>());

  get size(): number {
    return this.#keys.size;
  }

  has(key: K): boolean {
    return this.#keys.has(key);
  }

  add(...keys: K[]): void {
    this.#keys = new Set([...this.#keys, ...keys]);
  }

  delete(...keys: K[]): void {
    const next = new Set(this.#keys);
    for (const k of keys) next.delete(k);
    this.#keys = next;
  }

  async run<T>(key: K, fn: () => Promise<T>): Promise<T> {
    return this.runAll([key], fn);
  }

  async runAll<T>(keys: K[], fn: () => Promise<T>): Promise<T> {
    this.add(...keys);
    try {
      return await fn();
    } finally {
      this.delete(...keys);
    }
  }
}
