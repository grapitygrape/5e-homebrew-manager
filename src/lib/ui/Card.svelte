<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'elevated';

  let {
    label,
    value,
    sub,
    variant = 'default',
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    label?: string;
    value?: string | number;
    sub?: string;
    variant?: Variant;
    children?: Snippet;
  } = $props();
</script>

<div
  {...rest}
  class={['card', variant === 'elevated' && 'card-elevated', className]}
>
  {#if label}
    <span class="card-label">{label}</span>
  {/if}
  {#if value != null}
    <strong class="card-value">{value}</strong>
  {/if}
  {@render children?.()}
  {#if sub}
    <span class="card-sub">{sub}</span>
  {/if}
</div>

<style>
  .card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-5) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .card-elevated {
    background: var(--bg-elevated);
  }

  .card-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .card-value {
    font-size: var(--text-3xl);
    font-family: var(--font-display);
    color: var(--gold-bright);
  }

  .card-sub {
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
</style>
