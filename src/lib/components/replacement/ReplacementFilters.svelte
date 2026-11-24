<!--
  ReplacementFilters — view swap, search, type/warnings filter, and "Add a
  replacement" CTA above the mapping table.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import {
    WARNINGS_FILTER,
    type ReplacementPage,
  } from '$lib/state/replacement-page.svelte.ts';
  import { formatNumber } from '$lib/util';

  interface Props {
    page: ReplacementPage;
  }

  let { page }: Props = $props();
</script>

<div class="filters">
  <Button
    title="Show what each homebrew item supersedes, instead of what replaces each original"
    onclick={() => (page.swapped = !page.swapped)}>Swap view</Button
  >
  <SearchInput
    bind:value={page.listQuery}
    placeholder="Filter by name or source."
  />
  <SelectInput bind:value={page.category} aria-label="Content type">
    <option value="">All types</option>
    {#if page.warningCount || page.warningsOnly}
      <option value={WARNINGS_FILTER}
        >Warnings ({formatNumber(page.warningCount)})</option
      >
    {/if}
    {#each page.categories as c (c.prop)}
      <option value={c.prop}>{c.label} ({formatNumber(c.count)})</option>
    {/each}
  </SelectInput>
  <Button variant="primary" onclick={page.addReplacement}>
    <i class="fa-sharp-duotone fa-regular fa-swap" aria-hidden="true"></i>
    Add a replacement
  </Button>
</div>

<style>
  .filters {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    margin: 0.25rem 0 0.75rem;
  }
  .filters :global(.search-input) {
    flex: 4;
    min-inline-size: 14rem;
  }
  .filters :global(select.text-input) {
    flex: 1;
    min-inline-size: 14rem;
  }
</style>
