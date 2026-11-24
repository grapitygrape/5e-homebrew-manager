<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    type = 'text',
    class: className,
    ...rest
  }: HTMLInputAttributes & { value?: string } = $props();
</script>

<input {...rest} {type} bind:value class={['text-input', className]} />

<style>
  @import './field-input.css';
</style>
