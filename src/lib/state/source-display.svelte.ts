/**
 * state/source-display.svelte.ts — what every SourceTag reads.
 *
 * A tag asks for its id as it draws; asks made in the same tick go out as one
 * request (a table of 200 rows is one round trip, not 200), and each answer is
 * kept for the life of the window. An id nothing declares is kept as null so
 * it isn't asked for again. Settings and Setup call `resetSourceDisplay()`
 * alongside `forget()`, since a new data path can change every answer.
 */
import { SvelteMap } from 'svelte/reactivity';
import { resolveSources, type SourceDisplay } from '$lib/api';

const known = new SvelteMap<string, SourceDisplay | null>();
const asked = new Set<string>();
let batch: string[] = [];

function flush() {
  const ids = batch;
  batch = [];
  resolveSources(ids)
    .then((found) => {
      for (const id of ids) known.set(id, found[id] ?? null);
    })
    .catch(() => {
      // Unreachable server: show the raw ids rather than ask forever.
      for (const id of ids) known.set(id, null);
    });
}

/**
 * How a source looks: undefined while it is being looked up, null when
 * nothing declares it. Reactive, so a tag redraws when the answer lands.
 */
export function sourceDisplay(id: string): SourceDisplay | null | undefined {
  const key = id.toLowerCase();
  if (!asked.has(key)) {
    asked.add(key);
    if (!batch.length) queueMicrotask(flush);
    batch.push(key);
  }
  return known.get(key);
}

export function resetSourceDisplay(): void {
  asked.clear();
  known.clear();
}
