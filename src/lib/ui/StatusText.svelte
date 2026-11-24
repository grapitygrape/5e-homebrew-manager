<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'error' | 'warning' | 'ok';
  type As = 'span' | 'p' | 'div';

  let {
    as = 'span',
    variant = 'default',
    children,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    as?: As;
    variant?: Variant;
    children?: Snippet;
  } = $props();

  const classes = $derived([
    'status-text',
    variant !== 'default' && `status-text-${variant}`,
    className,
  ]);
</script>

<svelte:element this={as} {...rest} class={classes}>
  {@render children?.()}
</svelte:element>

<style>
  .status-text {
    color: inherit;
  }

  .status-text-error {
    color: var(--danger);
  }

  .status-text-warning {
    color: var(--warn);
  }

  .status-text-ok {
    color: var(--ok);
  }

  /* For engine/preview HTML strings */
  :global(.status-text-error) {
    color: var(--danger);
  }
</style>
