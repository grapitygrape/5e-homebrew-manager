<!--
  SourceRow - one source's card in SourceBrowser: the collapsible source row
  (cells in the caller's column order), its content-type rows with counts,
  and each open type's entries, already loaded and budgeted by SourceBrowser.
  What a row MEANS (checkboxes, picking, tones) comes from the caller's hooks.
-->
<script lang="ts">
  import Badge from '$lib/ui/Badge.svelte';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import { formatNumber, formatUtcDate } from '$lib/util';
  import {
    cardId,
    dateTitle,
    itemKey,
    typeKey,
    type ColumnLayout,
    type IndexedEntity,
    type RowHooks,
    type SourceSummary,
    type SourceTypeCount,
  } from '../source-browser.ts';

  interface Props {
    s: SourceSummary;
    layout: ColumnLayout;
    hooks: RowHooks;
    isOpen: boolean;
    /** The source last toggled, marked with a gold edge. */
    active: boolean;
    /** The types to draw once open (SourceBrowser applies filters and hits). */
    types: SourceTypeCount[];
    /** Open types, keyed by typeKey(). */
    openTypes: Set<string>;
    /** Types whose entries are being fetched, keyed by typeKey(). */
    itemLoading: Set<string>;
    /** One type's entries after filters and the row budget. */
    itemsFor: (prop: string) => { rows: IndexedEntity[]; total: number };
    /** The trimmed search, for the "nothing matches" line. */
    query: string;
    /** The category filter; while set, the type's own cap hint is not shown. */
    categoryProp: string;
    onToggleSource: () => void;
    onToggleType: (prop: string) => void;
  }

  let {
    s,
    layout,
    hooks,
    isOpen,
    active,
    types,
    openTypes,
    itemLoading,
    itemsFor,
    query,
    categoryProp,
    onToggleSource,
    onToggleType,
  }: Props = $props();

  const tone = $derived(hooks.sourceTone?.(s) ?? null);
</script>

<div class="card" id={cardId(s.source)} class:active>
  <div
    class="row row-source"
    class:blocked={tone === 'blocked'}
    class:partial={tone === 'partial'}
    class:blocklisted={tone === 'blocklisted'}
    class:dependency={s.isDependency}
  >
    {@render hooks.sourceLead?.(s)}
    {#each layout.drawn as col (col)}
      {#if col === 'abbr'}
        <button
          class="expander col-abbr"
          onclick={onToggleSource}
          aria-expanded={isOpen}
        >
          {#if layout.chevHost === 'abbr'}<span class="chev" class:open={isOpen}
              >›</span
            >{/if}
          <!-- The tag carries the source id as its title, which matters
               here: the column is fixed-width, so a long one ellipses. -->
          <SourceTag source={s.source} class="abbr" />
        </button>
      {:else if col === 'name'}
        <!-- Clickable, and it toggles - but it does not ANNOUNCE the
             disclosure while the abbreviation cell does, or a screen
             reader reads two controls for one thing. -->
        <button
          class="expander"
          onclick={onToggleSource}
          aria-expanded={layout.hasAbbrColumn ? undefined : isOpen}
        >
          {#if layout.chevHost === 'name'}<span class="chev" class:open={isOpen}
              >›</span
            >{/if}
          <!-- Nothing to say when the title IS the abbreviation next door. -->
          {#if !layout.hasAbbrColumn || s.full !== s.source}<span class="full"
              >{s.full}</span
            >{/if}
        </button>
      {:else if col === 'tags'}
        <span class="col-tags">
          {#if s.isDependency}<Badge
              class="dependency-tag"
              title="Pulled in by a homebrew file's _meta.dependencies - the site loads all of it"
              >dependency</Badge
            >{:else if s.isPartnered}<Badge class="partnered-tag"
              >partnered</Badge
            >{:else if s.isHomebrew}<Badge class="brew-tag">brew</Badge>{/if}
        </span>
      {:else if col === 'added'}
        <span
          class="row-date"
          class:undated={s.dateAdded === null}
          title={dateTitle(s)}>{formatUtcDate(s.dateAdded)}</span
        >
      {:else if col === 'count'}
        <span
          class="row-count"
          title={hooks.sourceCount ? 'Allowed/total' : undefined}
        >
          {#if hooks.sourceCount}
            {@render hooks.sourceCount(s)}
          {:else}
            {formatNumber(s.total)}
          {/if}
        </span>
      {:else if col === 'actions'}
        <span class="col-actions"></span>
      {/if}
    {/each}
  </div>

  {#if isOpen}
    {#each types as t (t.prop)}
      {@const tTone = hooks.typeTone?.(s, t) ?? null}
      {@const key = typeKey(s.source, t.prop)}
      {@const typeOpen = openTypes.has(key)}
      <div class="type-block">
        <div
          class="row row-type"
          class:blocked={tTone === 'blocked'}
          class:partial={tTone === 'partial'}
          class:blocklisted={tTone === 'blocklisted'}
        >
          {@render hooks.typeLead?.(s, t)}
          <button
            class="expander"
            onclick={() => onToggleType(t.prop)}
            aria-expanded={typeOpen}
          >
            <span class="chev" class:open={typeOpen}>›</span>
            <span class="row-label">{t.label}</span>
          </button>
          <!-- A type has a count but no date; the empty cell holds open
               whatever follows the count, so the count stays under Count
               wherever the caller put it. Actions are the caller's, and
               empty unless it passed `typeActions`. -->
          {#each layout.typeTrailing as col (col)}
            {#if col === 'count'}
              <span
                class="row-count"
                title={hooks.typeCount ? 'Allowed/total' : undefined}
              >
                {#if hooks.typeCount}
                  {@render hooks.typeCount(s, t)}
                {:else}
                  {formatNumber(t.count)}
                {/if}
              </span>
            {:else if col === 'added'}
              <span class="pad-added"></span>
            {:else if col === 'actions'}
              <span class="col-actions"
                >{@render hooks.typeActions?.(s, t)}</span
              >
            {/if}
          {/each}
        </div>

        {#if typeOpen}
          {#if itemLoading.has(key)}
            <p class="muted indent">Loading {t.label.toLowerCase()}.</p>
          {:else}
            {@const view = itemsFor(t.prop)}
            {#if view.total === 0}
              <p class="muted indent">
                {query
                  ? `Nothing matches "${query}".`
                  : 'Nothing left to show.'}
              </p>
            {:else if view.rows.length === 0}
              <!-- Category mode, budget spent before reaching this source. -->
              <p class="muted indent">
                {formatNumber(view.total)} entries - use Load more at the bottom.
              </p>
            {:else}
              <div class="item-list">
                {#each view.rows as item (item.hash)}
                  {@const iTone =
                    hooks.itemTone?.(s.source, t.prop, item) ?? null}
                  {@const picked =
                    hooks.selectedKeys?.has(
                      itemKey(s.source, t.prop, item.hash),
                    ) ?? false}
                  {#if hooks.itemLead}
                    <label
                      class="row row-item"
                      class:blocked={iTone === 'blocked'}
                      class:blocklisted={iTone === 'blocklisted'}
                    >
                      {@render hooks.itemLead(s, t, item)}
                      <span class="row-label">{item.name}</span>
                      {#if layout.hasActions}<span class="col-actions"
                          >{@render hooks.itemActions?.(s, t, item)}</span
                        >{/if}
                    </label>
                  {:else if hooks.onPickItem}
                    {@const onPickItem = hooks.onPickItem}
                    <button
                      type="button"
                      class="row row-item row-pick"
                      class:blocked={iTone === 'blocked'}
                      class:blocklisted={iTone === 'blocklisted'}
                      class:picked
                      aria-pressed={picked}
                      onclick={(event) =>
                        onPickItem({
                          source: s,
                          prop: t.prop,
                          item,
                          event,
                        })}
                    >
                      <span class="row-label">{item.name}</span>
                    </button>
                  {:else}
                    <div
                      class="row row-item"
                      class:blocked={iTone === 'blocked'}
                      class:blocklisted={iTone === 'blocklisted'}
                    >
                      <span class="row-label">{item.name}</span>
                      {#if layout.hasActions}<span class="col-actions"
                          >{@render hooks.itemActions?.(s, t, item)}</span
                        >{/if}
                    </div>
                  {/if}
                {/each}
              </div>
              {#if view.total > view.rows.length && !categoryProp}
                <p class="hint indent">
                  Showing {formatNumber(view.rows.length)} of {formatNumber(
                    view.total,
                  )} - narrow it with the filter above.
                </p>
              {/if}
            {/if}
          {/if}
        {/if}
      </div>
    {:else}
      <p class="muted indent">
        {hooks.noTypesMessage?.(s) ?? `Nothing to show in ${s.source}.`}
      </p>
    {/each}
  {/if}
</div>

<style>
  /* Matches the header's .ch-date / .ch-count so the values line up under
     their headers. */
  .row-date {
    width: var(--col-added-width);
    flex-shrink: 0;
    text-align: end;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    cursor: help;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Holds the date column open on a row that has no date of its own. */
  .pad-added {
    width: var(--col-added-width);
    flex-shrink: 0;
  }
  .row-date.undated {
    color: var(--text-faint);
  }

  .card {
    border-bottom: 1px solid var(--border);
  }
  .card.active {
    border-inline-start: 0.125rem solid var(--gold);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding-block: 0.1875rem 0.3125rem;
    padding-inline: 0.375rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--text-main);
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.blocked {
    color: var(--text-faint);
  }
  /* Loaded reads white, partly loaded the lighter grey of the dates, not
     loaded the darker grey above. */
  .row.partial {
    color: var(--text-muted);
  }
  /* Blocked by content-blocklist.json - dead content, whatever this page is
     authoring. The outline is offset INWARD: rows here are flush neighbours, so
     an outline drawn on the edge would sit on the next row's and read as one
     box around two rows. -1px keeps it inside its own row. */

  .row.blocklisted {
    .row-label,
    :global(.abbr),
    .full {
      opacity: 0.5;
    }
    :global(.abbr) {
      text-decoration: line-through;
    }
  }
  /* A partly included source's box reads amber, so the state shows at the
     start of the row as well as in its grey title. */
  .row :global(input[type='checkbox']) {
    flex-shrink: 0;
    accent-color: var(--warn);
  }
  .row :global(input[type='checkbox'].ind) {
    accent-color: var(--warn-darker);
  }
  .row.blocked :global(input[type='checkbox']) {
    accent-color: var(--text-faint);
  }
  .row-item {
    cursor: pointer;
  }
  /* A clickable entry is a button, so it needs the button chrome removed and
     the row geometry put back. */
  .row-pick {
    width: 100%;
    background: none;
    border: none;
    font: inherit;
    font-size: var(--text-sm);
    color: inherit;
    text-align: start;
  }
  .row-pick.picked {
    background: var(--bg-hover);
    color: var(--gold);
    box-shadow: inset 0.125rem 0 0 var(--gold);
  }
  .row-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-count {
    width: var(--col-count-width);
    flex-shrink: 0;
    text-align: end;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row.blocked .row-count {
    color: var(--text-faint);
  }
  .row.partial .row-count {
    color: var(--text-muted);
  }
  .expander {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    font-size: inherit;
    text-align: start;
    cursor: pointer;
    padding: 0;
  }
  /* Fixed, so the abbreviation and the title read as two columns rather than
     one ragged run - which is the whole point of splitting them. */
  .col-abbr {
    flex: 0 0 var(--col-abbr-width);
  }
  .col-tags {
    width: var(--col-tags-width);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  .col-actions {
    width: var(--col-actions-width);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.25rem;
  }
  /* SourceTag sets the font and the source's own colour; the fixed column
     only needs it to truncate. */
  .col-abbr :global(.abbr) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .full {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
  }
  :global(.badge.brew-tag),
  :global(.badge.partnered-tag),
  :global(.badge.dependency-tag) {
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  :global(.badge.dependency-tag) {
    background: hsl(24 85% 56% / 0.12);
    border-color: hsl(24 85% 56% / 0.35);
    color: var(--dependency);
  }
  .chev {
    display: inline-block;
    transition: transform 0.12s;
    color: var(--gold);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .type-block {
    padding-inline-start: 1.25rem;
  }
  .item-list {
    padding-inline-start: 1.375rem;
  }
  .indent {
    padding-inline-start: 1.625rem;
  }
  .muted {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .hint {
    margin: 0.375rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
</style>
