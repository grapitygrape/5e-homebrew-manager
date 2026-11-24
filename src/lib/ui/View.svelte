<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Width = 'default' | 'wide';

  let {
    width = 'default',
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    width?: Width;
    children?: Snippet;
  } = $props();
</script>

<section {...rest} class={['view', width === 'wide' && 'view-wide', className]}>
  {@render children?.()}
</section>

<style>
  .view {
    padding-block: 1.75rem 5rem;
    padding-inline: 2rem;
    width: auto;
  }

  .view > :global(*) {
    max-width: 68.75rem;
  }

  .view-wide > :global(*) {
    max-width: 80rem;
  }
</style>
