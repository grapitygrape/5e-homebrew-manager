<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  let {
    error = false,
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    error?: boolean;
    children?: Snippet;
  } = $props();
</script>

<div {...rest} class={['row-card', error && 'row-card-error', className]}>
  {@render children?.()}
</div>

<style>
  .row-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2) var(--space-5);
    align-items: center;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-3) var(--space-4);
  }

  .row-card-error {
    border-color: hsl(2 70% 56% / 0.5);
  }

  @media (max-width: 720px) {
    .row-card {
      grid-template-columns: 1fr;
    }
  }
</style>
