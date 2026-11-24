<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  let {
    value = $bindable(''),
    children,
    class: className,
    ...rest
  }: HTMLSelectAttributes & { children?: Snippet; value?: string } = $props();
</script>

<select {...rest} bind:value class={['text-input', className]}>
  {@render children?.()}
</select>

<style>
  @import './field-input.css';

  .text-input {
    cursor: pointer;
  }
</style>
