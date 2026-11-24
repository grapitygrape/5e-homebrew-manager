/**
 * The page cache's contract: a first visit waits for the fetch, a revisit gets
 * the remembered value at once and a background refresh, and the reload that
 * refresh triggers takes the new value without fetching again.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const invalidate = vi.fn(async (_dep: string) => {});
vi.mock('$app/navigation', () => ({ invalidate }));

const { cachedLoad, cacheActivity, forget, peek, remember } = await import(
  './page-cache.svelte.ts'
);

const depends = () => {};

/** A fetcher that answers from a list, so each call is told apart by content. */
function answers(...values: string[]) {
  let next = 0;
  return vi.fn(async () => values[next++]);
}

beforeEach(() => {
  forget();
  invalidate.mockClear();
  vi.useRealTimers();
});

describe('cachedLoad', () => {
  it('waits for the fetch on a first visit', async () => {
    const fetcher = answers('first');
    expect(await cachedLoad('k', depends, fetcher)).toBe('first');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(peek('k')).toBe('first');
  });

  it('answers a revisit from the cache and refreshes behind it', async () => {
    vi.useFakeTimers();
    remember('k', 'old');
    vi.advanceTimersByTime(5000);

    const fetcher = answers('new');
    expect(await cachedLoad('k', depends, fetcher)).toBe('old');
    expect(cacheActivity.refreshing).toBe(true);

    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith('cache:k'));
    expect(peek('k')).toBe('new');
    expect(cacheActivity.refreshing).toBe(false);
  });

  it("takes a just-refreshed value without fetching again", async () => {
    remember('k', 'fresh');
    const fetcher = answers('unused');
    expect(await cachedLoad('k', depends, fetcher)).toBe('fresh');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the old value when the refresh fails', async () => {
    vi.useFakeTimers();
    remember('k', 'old');
    vi.advanceTimersByTime(5000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await cachedLoad('k', depends, fetcher)).toBe('old');
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());

    expect(peek('k')).toBe('old');
    expect(invalidate).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shares one fetch between callers that arrive together', async () => {
    const fetcher = answers('once', 'twice');
    const [a, b] = await Promise.all([
      cachedLoad('k', depends, fetcher),
      cachedLoad('k', depends, fetcher),
    ]);
    expect([a, b]).toEqual(['once', 'once']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('forget', () => {
  it('drops the keys named, or all of them', () => {
    remember('a', 1);
    remember('b', 2);
    remember('c', 3);
    forget('a', 'c');
    expect(peek('a')).toBeUndefined();
    expect(peek('c')).toBeUndefined();
    expect(peek('b')).toBe(2);
    forget();
    expect(peek('b')).toBeUndefined();
  });
});
