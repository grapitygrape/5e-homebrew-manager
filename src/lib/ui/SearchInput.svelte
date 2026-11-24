<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  let {
    value = $bindable(''),
    class: className,
    type: _type,
    ...rest
  }: HTMLInputAttributes & { value?: string } = $props();

  let inputEl: HTMLInputElement | undefined;

  function clearSearch() {
    value = '';
    inputEl?.focus();
  }
</script>

<div class="search-input">
  <input
    {...rest}
    type="search"
    bind:value
    bind:this={inputEl}
    class={['text-input', 'search-input-field', className]}
  />
  {#if value}
    <button
      type="button"
      class="search-input-clear"
      aria-label="Clear search"
      onclick={clearSearch}
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  {/if}
</div>

<style>
  @import './field-input.css';

  .search-input {
    position: relative;
  }

  .search-input-field {
    padding-inline-end: 2rem;
  }

  .search-input-field::-webkit-search-cancel-button,
  .search-input-field::-webkit-search-decoration {
    -webkit-appearance: none;
    appearance: none;
  }

  .search-input-clear {
    position: absolute;
    inset-inline-end: var(--hm-space-1-5);
    inset-block-start: 50%;
    translate: 0 -50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--hm-space-0-5) var(--hm-space-1-5);
    font: inherit;
    font-size: var(--text-xs);
    line-height: var(--line-height-none);
    color: var(--text-muted);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .search-input-clear:hover {
    color: var(--text-main);
    background: var(--bg-hover);
    border-color: var(--border-strong);
  }

  .search-input-clear:focus-visible {
    outline: var(--hm-space-0-5) solid var(--gold);
    outline-offset: var(--hm-space-0-5);
  }
</style>
