<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  let {
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div {...rest} class={['panel', className]}>
  {@render children?.()}
</div>

<style>
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-5) var(--space-5);
    margin-bottom: var(--space-6);
  }

  .panel > :global(h2) {
    margin: 0 0 var(--space-1);
  }
</style>
