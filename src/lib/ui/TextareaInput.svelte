<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    mono = false,
    class: className,
    ...rest
  }: HTMLTextareaAttributes & { value?: string; mono?: boolean } = $props();
</script>

<textarea
  {...rest}
  bind:value
  class={['text-input', mono && 'text-input-mono', className]}></textarea>

<style>
  @import './field-input.css';

  textarea.text-input {
    min-height: 10rem;
    resize: vertical;
    line-height: var(--line-height-normal);
  }

  textarea.text-input-mono {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
</style>
