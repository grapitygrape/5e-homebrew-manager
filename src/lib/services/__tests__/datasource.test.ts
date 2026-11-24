import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedResource, resetDataSource } from '../datasource';

afterEach(() => {
  resetDataSource();
});

describe('cachedResource', () => {
  it('caches resolved values and deduplicates concurrent in-flight loads', async () => {
    let resolveLoad!: (v: string) => void;
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const res = cachedResource(loader);

    expect(res.isReady()).toBe(false);
    const p1 = res.get();
    const p2 = res.get();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(res.isReady()).toBe(false);

    resolveLoad('ok');
    expect(await Promise.all([p1, p2])).toEqual(['ok', 'ok']);
    expect(res.isReady()).toBe(true);

    // Subsequent call returns cached value without invoking loader again.
    expect(await res.get()).toBe('ok');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads on force=true, reset(), and resetDataSource()', async () => {
    let n = 0;
    const res = cachedResource(() => ++n);

    expect(await res.get()).toBe(1);
    expect(await res.get()).toBe(1);

    expect(await res.get(true)).toBe(2);
    expect(res.isReady()).toBe(true);

    res.reset();
    expect(res.isReady()).toBe(false);
    expect(await res.get()).toBe(3);

    resetDataSource();
    expect(res.isReady()).toBe(false);
    expect(await res.get()).toBe(4);
  });

  it('does not cache rejections and retries on the next call', async () => {
    let attempt = 0;
    const res = cachedResource(async () => {
      attempt++;
      if (attempt === 1) throw new Error('boom');
      return 'recovered';
    });

    await expect(res.get()).rejects.toThrow('boom');
    expect(res.isReady()).toBe(false);
    expect(await res.get()).toBe('recovered');
    expect(res.isReady()).toBe(true);
  });

  it('ignores stale in-flight resolution if reset() happened mid-load', async () => {
    let resolveFirst!: (v: string) => void;
    let calls = 0;
    const res = cachedResource(() => {
      calls++;
      if (calls === 1) {
        return new Promise<string>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve('fresh');
    });

    const first = res.get();
    await Promise.resolve();
    res.reset();
    const second = res.get();
    expect(await second).toBe('fresh');

    // Stale first load finishes later — must not overwrite cached 'fresh' value.
    resolveFirst('stale');
    expect(await first).toBe('stale');
    expect(await res.get()).toBe('fresh');
  });
});
