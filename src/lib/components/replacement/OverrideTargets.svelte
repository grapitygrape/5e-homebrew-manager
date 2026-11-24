<!--
  components/replacement/OverrideTargets.svelte - which sources an override
  rule reaches, and which entities inside them it skips.

  The Blocklist's checkbox language: ticked is "overridden", unticked is "left
  alone", indeterminate amber is "some of it". A match a hand-written mapping
  already claims is drawn but locked - the rule would skip it anyway, and
  letting it be ticked would promise something Save won't do.

  SEARCH NARROWS, IT DOESN'T SELECT
    A query matching a source's abbreviation or title shows that source whole;
    otherwise sources show only their matching entries, opened. The all/none
    box acts on the sources in view, so "search, then untick all" is how you
    drop a handful of books at once.
-->
<script lang="ts">
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import type { OverrideTarget } from '$lib/engine/supersession';

  export type NamedTarget = OverrideTarget & { full: string };

  interface Props {
    targets: NamedTarget[];
    /** Lowercased source codes the rule reaches. */
    selected: Set<string>;
    /** `page|hash` keys unticked inside a selected source. */
    excluded: Set<string>;
    /** `page|hash` keys a hand-written row already maps. */
    handKeys: Set<string>;
    onToggleSource: (source: string) => void;
    onToggleMatch: (key: string) => void;
    /** Tick (`true`) or untick every listed source, wholly. */
    onSetSources: (sources: string[], on: boolean) => void;
  }

  let {
    targets,
    selected,
    excluded,
    handKeys,
    onToggleSource,
    onToggleMatch,
    onSetSources,
  }: Props = $props();

  let open = $state(new Set<string>());
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());

  /** A source whose own name matches is shown whole. */
  const nameHit = (t: NamedTarget): boolean =>
    !!q &&
    (t.source.toLowerCase().includes(q) || t.full.toLowerCase().includes(q));

  const shownMatches = (t: NamedTarget) =>
    !q || nameHit(t)
      ? t.matches
      : t.matches.filter((m) => m.name.toLowerCase().includes(q));

  const shown = $derived(
    targets.filter((t) => !q || nameHit(t) || shownMatches(t).length),
  );

  const shownOn = $derived(
    shown.filter((t) => selected.has(t.source.toLowerCase()) && chosen(t) > 0),
  );
  const allOn = $derived(shown.length > 0 && shownOn.length === shown.length);
  const someOn = $derived(shownOn.length > 0 && !allOn);

  function toggleOpen(source: string) {
    const next = new Set(open);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    open = next;
  }

  /** How many of a source's matches the rule would actually write. */
  const chosen = (t: NamedTarget): number =>
    selected.has(t.source.toLowerCase())
      ? t.matches.filter((m) => !excluded.has(m.key) && !handKeys.has(m.key))
          .length
      : 0;

  const free = (t: NamedTarget): number =>
    t.matches.filter((m) => !handKeys.has(m.key)).length;
</script>

<div class="tools">
  <label class="all" title={q ? 'Every source in view' : 'Every source'}>
    <input
      type="checkbox"
      checked={allOn}
      indeterminate={someOn}
      class:ind={someOn}
      disabled={!shown.length}
      onchange={() =>
        onSetSources(
          shown.map((t) => t.source),
          !allOn,
        )}
    />
    {q ? `All ${shown.length} shown` : 'All sources'}
  </label>
  <SearchInput
    bind:value={query}
    placeholder="Filter by source, title or name."
  />
</div>

{#if !shown.length}
  <p class="empty">Nothing matches "{query.trim()}".</p>
{/if}

<ul class="targets">
  {#each shown as t (t.source)}
    {@const on = selected.has(t.source.toLowerCase())}
    {@const n = chosen(t)}
    {@const partial = on && n > 0 && n < free(t)}
    {@const list = shownMatches(t)}
    <!-- Name hits open themselves; you searched for something inside. -->
    {@const isOpen = open.has(t.source) || (!!q && !nameHit(t))}
    <li>
      <div class="row">
        <input
          type="checkbox"
          checked={on && n > 0}
          indeterminate={partial}
          class:ind={partial}
          title={on
            ? `Stop overriding ${t.source}`
            : `Override same-named entries in ${t.source}`}
          onchange={() => onToggleSource(t.source)}
        />
        <button
          class="expander"
          aria-expanded={isOpen}
          onclick={() => toggleOpen(t.source)}
        >
          <span class="chev" class:open={isOpen}>›</span>
          <SourceTag source={t.source} />
          <span class="full">{t.full}</span>
        </button>
        <span class="count">{n} / {t.matches.length}</span>
      </div>
      {#if isOpen}
        <ul class="matches">
          {#each list as m (m.key)}
            {@const hand = handKeys.has(m.key)}
            <li class="row" class:hand>
              <label
                title={hand
                  ? 'Mapped by hand - that mapping wins over this rule'
                  : undefined}
              >
                <input
                  type="checkbox"
                  checked={on && !hand && !excluded.has(m.key)}
                  disabled={!on || hand}
                  onchange={() => onToggleMatch(m.key)}
                />
                <span class="name">{m.name}</span>
                {#if hand}<span class="note">mapped by hand</span>{/if}
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--hm-space-1-5);
    padding-inline-start: var(--hm-space-1-5);
  }
  .tools :global(.search-input) {
    flex: 1;
  }
  .all {
    flex: 0 0 auto;
    white-space: nowrap;
    font-size: var(--text-sm);
  }
  .all :global(input[type='checkbox']) {
    accent-color: var(--warn);
  }
  .all :global(input[type='checkbox'].ind) {
    accent-color: var(--warn-darker);
  }
  .empty {
    color: var(--text-muted);
    padding-inline-start: var(--hm-space-1-5);
  }
  .targets,
  .matches {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .matches {
    padding-inline-start: 2.25rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--hm-space-1-5);
    padding: var(--space-1) var(--hm-space-1-5);
    border-radius: var(--radius-sm);
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row :global(input[type='checkbox']) {
    flex-shrink: 0;
    accent-color: var(--warn);
  }
  .row :global(input[type='checkbox'].ind) {
    accent-color: var(--warn-darker);
  }
  .expander {
    display: flex;
    align-items: center;
    gap: var(--hm-space-1-5);
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .chev {
    display: inline-block;
    transition: transform 0.12s;
    color: var(--gold);
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .full {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
  }
  .count {
    font-variant-numeric: tabular-nums;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  label {
    display: flex;
    align-items: center;
    gap: var(--hm-space-1-5);
    flex: 1;
    cursor: pointer;
  }
  .hand {
    color: var(--text-faint);
  }
  .hand label {
    cursor: default;
  }
  .note {
    font-size: var(--text-xs);
  }
</style>
