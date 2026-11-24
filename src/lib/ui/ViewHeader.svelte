<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  let {
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div {...rest} class={['view-header', className]}>
  {@render children?.()}
</div>

<style>
  .view-header :global(h1) {
    margin: 0 0 var(--space-1);
    font-size: var(--text-2xl);
    line-height: var(--line-height-display);
  }

  .view-header :global(p) {
    margin: 0 0 var(--space-6);
    color: var(--text-muted);
  }
</style>
