<script lang="ts">
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'outlined' | 'text';

  let {
    children,
    variant = 'secondary',
    size,
    class: className,
    ...rest
  }: HTMLAnchorAttributes & {
    variant?: Variant;
    size?: 'small';
    children?: Snippet;
  } = $props();
</script>

<a
  {...rest}
  class={[
    'button',
    `button-${variant}`,
    size === 'small' && 'button-small',
    className,
  ]}
>
  {@render children?.()}
</a>

<style>
  @import './button.css';
</style>
