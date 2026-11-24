<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Spacing = 'outer' | 'inner';

  let {
    spacing,
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    spacing?: Spacing;
    children?: Snippet;
  } = $props();
</script>

<div
  {...rest}
  class={[
    'card-grid',
    spacing === 'outer' && 'card-grid-outer',
    spacing === 'inner' && 'card-grid-inner',
    className,
  ]}
>
  {@render children?.()}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11.875rem, 1fr));
    gap: var(--space-4);
  }

  .card-grid-outer {
    margin-bottom: var(--space-6);
  }

  .card-grid-inner {
    margin: var(--space-2) 0 var(--space-5);
  }
</style>
