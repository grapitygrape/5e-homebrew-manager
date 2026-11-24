<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'error';

  let {
    variant = 'default',
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    variant?: Variant;
    children?: Snippet;
  } = $props();
</script>

<div
  {...rest}
  class={['empty-state', variant === 'error' && 'empty-state-error', className]}
>
  {@render children?.()}
</div>

<style>
  .empty-state {
    color: var(--text-muted);
    background: var(--bg-panel);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    padding: var(--space-6);
    text-align: center;
  }

  .empty-state-error {
    color: var(--danger);
    border-color: hsl(2 70% 56% / 0.35);
  }
</style>
