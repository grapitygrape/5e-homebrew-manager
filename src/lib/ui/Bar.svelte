<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type Variant = 'positive' | 'warning' | 'danger';

  let {
    value,
    variant = 'positive',
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    value: number;
    variant?: Variant;
  } = $props();

  const width = $derived(`${Math.min(100, Math.max(0, value))}%`);
</script>

<div class={['bar', className]} {...rest}>
  <div class={['bar-fill', `bar-fill-${variant}`]} style:width></div>
</div>

<style>
  .bar {
    height: var(--hm-space-1-5);
    border-radius: var(--space-1);
    background: var(--bg-sidebar);
    overflow: hidden;
    margin-top: var(--hm-space-1-5);
  }

  .bar-fill {
    height: 100%;
  }

  .bar-fill-positive {
    background: var(--ok);
  }

  .bar-fill-warning {
    background: var(--warn);
  }

  .bar-fill-danger {
    background: var(--danger);
  }
</style>
