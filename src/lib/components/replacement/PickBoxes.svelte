<!--
  components/replacement/PickBoxes.svelte - the picker's two staging lists.

  WHAT IT OWNS
    The `New item` / `Replaced item` boxes, their removable badges and the
    official content warning. It draws what is staged and reports intent;
    every mutation belongs to the route. Swap / Clear / Save live in the page
    header (PickActions).

  WHY TWO BOXES AND NOT A TABLE OF PAIRS
    Save builds N originals x M replacements - one row per original, each
    carrying every replacement. Pairs would have to be invented and then
    ignored. Two flat lists say exactly what the build does.
-->
<script lang="ts">
  import FilterBadge from '$lib/ui/FilterBadge.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import { itemKey } from '$lib/components/source-browser.ts';
  import type { PickedEntity } from '$lib/state/supersessions.svelte.ts';
  import { plural } from '$lib/util';

  /** Which list a badge came out of - the route needs to know which to rebuild. */
  type PickBox = 'new' | 'replaced';

  interface Props {
    /** The homebrew that supersedes. */
    newItems: PickedEntity[];
    /** The originals being superseded. */
    replacedItems: PickedEntity[];
    onRemove: (box: PickBox, p: PickedEntity) => void;
  }

  let { newItems, replacedItems, onRemove }: Props = $props();

  const officialNew = $derived(newItems.filter((p) => !p.isHomebrew));
</script>

{#snippet box(
  title: string,
  which: PickBox,
  items: PickedEntity[],
  empty: string,
)}
  <div class="box">
    <h3>
      {title}
      {#if items.length}<span class="tally">{items.length}</span>{/if}
    </h3>
    {#if items.length}
      <div class="chips">
        {#each items as p (itemKey(p.source, p.prop, p.hash))}
          <!-- Official content is only a problem in the New item box; in the
               Replaced box it is the ordinary case, so no tone there. -->
          <FilterBadge
            label={p.name}
            detail={p.source}
            variant={which === 'new' && !p.isHomebrew ? 'warning' : 'default'}
            title="{p.name} ({p.source})"
            removeLabel="Remove {p.name} ({p.source})"
            onremove={() => onRemove(which, p)}
          />
        {/each}
      </div>
    {:else}
      <p class="empty">{empty}</p>
    {/if}
  </div>
{/snippet}

<section class="boxes">
  {@render box(
    'New item',
    'new',
    newItems,
    'Find an item and press "Keep this", or replace all duplicate items found for a specific source using "Override duplicates".',
  )}
  {@render box(
    'Replaced item',
    'replaced',
    replacedItems,
    'Find the item(s) you want to replace and press "Replace this".',
  )}

  {#if officialNew.length}
    <p class="warn">
      <StatusText variant="warning"
        >{officialNew.length}
        {plural(officialNew.length, 'new item is', 'new items are')} from an official
        source.</StatusText
      > A replacement should be your homebrew - official content can't carry a marker,
      and pointing one official entity at another is rarely what you mean.
    </p>
  {/if}
</section>

<style>
  /* Two boxes side by side, as the design's mockup has them. */
  .boxes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 0.5rem 0.75rem;
    align-items: start;
    margin-bottom: 0.75rem;
  }
  .box {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-panel);
    padding: 0.5rem 0.625rem 0.625rem;
    min-inline-size: 0;
  }
  .box h3 {
    margin: 0 0 0.375rem;

    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .tally {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .empty {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .warn {
    grid-column: 1 / -1;
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .boxes {
      grid-template-columns: 1fr;
    }
  }
</style>
