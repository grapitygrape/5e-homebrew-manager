<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'outlined' | 'text';

  let {
    children,
    variant = 'secondary',
    size,
    type = 'button',
    class: className,
    ...rest
  }: HTMLButtonAttributes & {
    variant?: Variant;
    size?: 'small';
    children?: Snippet;
  } = $props();
</script>

<button
  {...rest}
  {type}
  class={[
    'button',
    `button-${variant}`,
    size === 'small' && 'button-small',
    className,
  ]}
>
  {@render children?.()}
</button>

<style>
  @import './button.css';
</style>
