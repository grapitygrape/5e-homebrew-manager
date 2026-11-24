<!--
  SourceBrowserToolbar - SourceBrowser's sticky head: the title, the filter row
  (search box, type select, the caller's own controls), the search hint, and
  the sortable column header with the expand-all chevron.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import { formatNumber } from '$lib/util';
  import {
    sortArrow,
    type CategoryOption,
    type ColumnLayout,
    type SortKey,
    type SourceSort,
  } from '../source-browser.ts';

  interface Props {
    title: string;
    /** The search box. */
    query: string;
    /** The type select. */
    categoryProp: string;
    categoryOptions: CategoryOption[];
    loadingCategory: boolean;
    /** False until the corpus is in; the type select waits for it. */
    hasSources: boolean;
    filterControls?: Snippet;
    searchHint: string;
    /** Reserve the leading checkbox column (the caller passed `sourceLead`). */
    leadBox: boolean;
    layout: ColumnLayout;
    sort: SourceSort;
    onSort: (key: SortKey) => void;
    anyOpen: boolean;
    onToggleAll: () => void;
    onPickType: (prop: string) => void;
  }

  let {
    title,
    query = $bindable(),
    categoryProp = $bindable(),
    categoryOptions,
    loadingCategory,
    hasSources,
    filterControls,
    searchHint,
    leadBox,
    layout,
    sort,
    onSort,
    anyOpen,
    onToggleAll,
    onPickType,
  }: Props = $props();
</script>

<!-- The expand-all control. Lives in whichever column comes first, so its hit
     area sits over the per-row chevrons however the columns are configured. -->
{#snippet chevAll()}
  <button
    class="chev-all"
    onclick={onToggleAll}
    aria-expanded={anyOpen}
    title={anyOpen
      ? 'Collapse every source'
      : 'Expand every source to its content types'}
    aria-label={anyOpen
      ? 'Collapse every source'
      : 'Expand every source to its content types'}
  >
    <span class="chev" class:open={anyOpen}>›</span>
  </button>
{/snippet}

<div class="pane-head">
  <div class="pane-header-inner">
    <h3>{title}</h3>
  </div>
  <!-- One row, same order, on every page that draws this tree: what you are
       looking for, which type, and the page's own "hide blocked". -->
  <div class="searches">
    <SearchInput
      bind:value={query}
      placeholder="Search sources and entries."
      aria-label="Search the corpus"
    />
    <SelectInput
      bind:value={categoryProp}
      disabled={loadingCategory || !hasSources}
      title="Narrow the search to one type - or, with the box empty, open that type across every source"
      aria-label="Type filter"
      onchange={(e) => onPickType((e.currentTarget as HTMLSelectElement).value)}
    >
      <option value="">{loadingCategory ? 'Loading.' : 'All types'}</option>
      {#each categoryOptions as c (c.prop)}
        <option value={c.prop}>{c.label} ({formatNumber(c.items)})</option>
      {/each}
    </SelectInput>
    {@render filterControls?.()}
  </div>
  {#if searchHint}<p class="hint search-hint">{searchHint}</p>{/if}
  <div class="col-head">
    {#if leadBox}<span class="ch-box"></span>{/if}
    <!-- Walks the same array, in the same order, as the source rows below, and
         each cell mirrors its row cell's width and flex/gap - so a label sits
         exactly over its values and the expand-all chevron over each row's
         own, whichever order the caller asked for. -->
    {#each layout.drawn as col (col)}
      {#if col === 'abbr'}
        <div class="ch-lead ch-abbr">
          {#if layout.chevHost === 'abbr'}{@render chevAll()}{/if}
          <button
            class="ch ch-name"
            class:on={sort.key === 'source'}
            onclick={() => onSort('source')}
          >
            Source <span class="arrow">{sortArrow(sort, 'source')}</span>
          </button>
        </div>
      {:else if col === 'name'}
        <div class="ch-lead">
          {#if layout.chevHost === 'name'}{@render chevAll()}{/if}
          <button
            class="ch ch-name"
            class:on={sort.key === 'name'}
            onclick={() => onSort('name')}
          >
            Title <span class="arrow">{sortArrow(sort, 'name')}</span>
          </button>
        </div>
      {:else if col === 'tags'}
        <span class="ch-tags"></span>
      {:else if col === 'added'}
        <button
          class="ch ch-date"
          class:on={sort.key === 'dateAdded'}
          title="When the source entered the corpus - a brew's dateAdded, or an official book's publication date. Undated sources sort last."
          onclick={() => onSort('dateAdded')}
        >
          <span class="arrow">{sortArrow(sort, 'dateAdded')}</span> Added
        </button>
      {:else if col === 'count'}
        <button
          class="ch ch-count"
          class:on={sort.key === 'total'}
          onclick={() => onSort('total')}
        >
          <span class="arrow">{sortArrow(sort, 'total')}</span> Count
        </button>
      {:else if col === 'actions'}
        <span class="ch-actions"></span>
      {/if}
    {/each}
  </div>
</div>

<style>
  .pane-header-inner {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .pane-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-panel);
    padding: 0.875rem 0 0.5rem;
  }
  .pane-head h3 {
    margin: 0 0 0.5rem;
    font-size: var(--text-base);
  }

  /* Search takes the room, the type select is fixed, and the caller's toggle
     takes what it needs at the end - so the row reads the same on every page
     however wide the panel is. */
  .searches {
    display: grid;
    grid-template-columns: 1fr minmax(9rem, 0.7fr) auto;
    align-items: center;
    gap: 0.375rem;
  }
  .hint {
    margin: 0.375rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .search-hint {
    margin: 0.375rem 0 0;
  }
  .searches :global(.search-input) {
    inline-size: 100%;
  }
  @media (max-width: 720px) {
    .searches {
      grid-template-columns: 1fr;
    }
  }

  /* Column header. Geometry is kept in lockstep with SourceRow's .row - same
     gap, same horizontal padding, same fixed widths (the --col-* properties on
     SourceBrowser's .pane) - so the labels sit over their cells without
     turning the expandable tree into an actual <table>. */
  .col-head {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.375rem 0.25rem;
    border-bottom: 1px solid var(--border);
  }
  .ch-box {
    width: 1rem;
    flex-shrink: 0;
  }
  .ch {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--text-faint);
    cursor: pointer;
    white-space: nowrap;
  }
  .ch:hover {
    color: var(--text-main);
  }
  .ch.on {
    color: var(--gold);
  }
  /* gap matches SourceRow's .expander so the header lines up with the rows. */
  .ch-lead {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex: 1;
    min-width: 0;
  }
  .chev-all {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  /* Same chevron as SourceRow's, so the expand-all one matches the rows'. */
  .chev {
    display: inline-block;
    transition: transform 0.12s;
    color: var(--gold);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .ch-abbr {
    flex: 0 0 var(--col-abbr-width);
  }
  .ch-name {
    text-align: start;
  }
  .ch-tags {
    width: var(--col-tags-width);
    flex-shrink: 0;
  }
  .ch-actions {
    width: var(--col-actions-width);
    flex-shrink: 0;
  }
  .ch-date {
    width: var(--col-added-width);
    flex-shrink: 0;
    text-align: end;
  }
  .ch-count {
    width: var(--col-count-width);
    flex-shrink: 0;
    text-align: end;
  }
  .arrow {
    font-size: var(--hm-text-2xs);
  }
</style>
