<!--
  A source as 5etools shows it - PHB'24, SDS - in its own colour, with the id
  the files store (XPHB, SpellsThatDontSuck) on hover. Use it anywhere a source
  id is drawn; state/source-display.svelte.ts does the lookup. A source with no
  colour reads as plain text, as on the site; one nothing declares is muted.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { sourceDisplay } from '$lib/state/source-display.svelte.ts';

  let {
    source,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & { source: string } = $props();

  const shown = $derived(sourceDisplay(source));
</script>

<span
  title={source}
  {...rest}
  class={['source-tag', shown === null && 'source-tag-unknown', className]}
  style:--source-color={shown?.color || null}
  >{shown?.abbreviation ?? source}</span
>

<style>
  .source-tag {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--source-color, var(--text-main));
  }

  .source-tag-unknown {
    color: var(--text-muted);
  }
</style>
