/** Tests for reactive BusySet helper. */
import { describe, it, expect } from 'vitest';
import { BusySet } from './busy-set.svelte.ts';

describe('BusySet', () => {
  it('tracks add, delete, has, and size', () => {
    const busy = new BusySet<string>();
    expect(busy.size).toBe(0);
    expect(busy.has('a')).toBe(false);

    busy.add('a', 'b');
    expect(busy.size).toBe(2);
    expect(busy.has('a')).toBe(true);
    expect(busy.has('b')).toBe(true);

    busy.delete('a');
    expect(busy.size).toBe(1);
    expect(busy.has('a')).toBe(false);
    expect(busy.has('b')).toBe(true);
  });

  it('marks keys busy during run/runAll and clears them on resolve or throw', async () => {
    const busy = new BusySet<string>();
    let during = false;
    const value = await busy.run('x', async () => {
      during = busy.has('x') && busy.size === 1;
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(during).toBe(true);
    expect(busy.has('x')).toBe(false);
    expect(busy.size).toBe(0);

    await expect(
      busy.runAll(['k1', 'k2'], async () => {
        expect(busy.size).toBe(2);
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    expect(busy.size).toBe(0);
  });
});
