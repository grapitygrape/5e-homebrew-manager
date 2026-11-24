/**
 * Schema Reference load — every homebrew entity type the brew schema declares.
 * The page renders a generated reference + validator for whichever type is
 * selected (variants, bookData, monster, … — not just the 14 markdown guides).
 *
 * Client-only, so the load always goes through lib/api.
 */
import type { PageLoad } from './$types';
import { listSchemaTypes } from '$lib/api';
import { cachedLoad } from '$lib/state/page-cache.svelte.ts';

export const ssr = false;

export const load: PageLoad = ({ depends }) =>
  cachedLoad('reference', depends, async () => {
    const types = await listSchemaTypes().catch(() => []);
    return { types };
  });
