<!--
  FoundryReportRow — one homebrew entry row in FoundryReportModal, plus its
  expandable multi-match list and per-match "open in Foundry" trigger.
-->
<script lang="ts">
  import { sourceLabel } from '$lib/engine/foundry/report.ts';
  import type { FoundryMatch, ReportRow } from '$lib/engine/foundry/types.ts';

  interface Props {
    row: ReportRow;
    open: boolean;
    statusLabel: string;
    canOpen: boolean;
    openTitle: string;
    opening: string | null;
    ontoggle: () => void;
    onopen?: (uuid: string, name: string) => void;
  }

  let {
    row,
    open,
    statusLabel,
    canOpen,
    openTitle,
    opening,
    ontoggle,
    onopen,
  }: Props = $props();

  const extraMatches = $derived(row.matches.length - (row.best ? 1 : 0));
</script>

{#snippet openButton(uuid: string, name: string)}
  {#if onopen}
    <button
      class="open-sheet"
      class:stale={!canOpen}
      title={openTitle}
      aria-label="Open {name} in Foundry"
      disabled={opening !== null}
      onclick={(ev) => {
        // The row toggles its match list on click; opening shouldn't.
        ev.stopPropagation();
        onopen(uuid, name);
      }}
      ><i
        class="fa-sharp-duotone fa-regular {opening === uuid
          ? 'fa-spinner fa-spin'
          : 'fa-arrow-up-right-from-square'}"
        aria-hidden="true"
      ></i></button
    >
  {/if}
{/snippet}

{#snippet sourceChip(m: FoundryMatch, ours: string)}
  {@const label = sourceLabel(m)}
  {#if label}
    <em
      class="msrc"
      class:mismatch={m.sourceMatch === false}
      title={m.sourceMatch === false
        ? `From ${label}, not ${ours}: a different ${m.name}`
        : m.sourceMatch
          ? `Same source as the homebrew (${ours})`
          : `Source in Foundry: ${label}`}>{label}</em
    >
  {:else}
    <em class="msrc unknown" title="This Foundry document records no source"
      >no source</em
    >
  {/if}
{/snippet}

{#snippet moreToggle(text: string)}
  <em class="more"
    >{text}
    <i
      class="fa-sharp-duotone fa-regular {open
        ? 'fa-chevron-down'
        : 'fa-chevron-right'}"
      aria-hidden="true"
    ></i></em
  >
{/snippet}

<div class="row {row.status}">
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="rmain" onclick={() => extraMatches > 0 && ontoggle()}>
    <span class="rname">
      <span class="dot {row.status}" title={statusLabel}></span>
      <b>{row.candidate.name}</b>
      <em class="type">{row.candidate.type}</em>
      {#if row.candidate.source}<em class="src">{row.candidate.source}</em>{/if}
    </span>

    <span class="rwhere">
      {#if row.best}
        {@render openButton(row.best.uuid, row.best.name)}
        <span class="pack">{row.best.packLabel}</span>
        {@render sourceChip(row.best, row.candidate.source)}
        <em class="dtype" class:mismatch={!row.best.typeMatch}
          >{row.best.docType || '—'}</em
        >
        {#if row.best.matchKind !== 'exact'}
          <em class="kind {row.best.matchKind}">
            {row.best.matchKind === 'fuzzy'
              ? `~${Math.round(row.best.score * 100)}%`
              : 'normalized'}
          </em>
        {/if}
        {#if extraMatches > 0}
          {@render moreToggle(`+${extraMatches} more`)}
        {/if}
      {:else}
        <em class="none">not in this world</em>
        {#if extraMatches > 0}
          {@render moreToggle(`${extraMatches} from another source`)}
        {/if}
      {/if}
    </span>

    <span class="num">
      {#if !row.best}—{:else if row.best.hasImage}<i
          class="ok fa-sharp-duotone fa-regular fa-check"
          aria-hidden="true"
        ></i>{:else}<i
          class="bad fa-sharp-duotone fa-regular fa-xmark"
          aria-hidden="true"
        ></i>{/if}
    </span>
    <span class="num">
      {#if !row.best}—{:else if row.best.hasDescription}<i
          class="ok fa-sharp-duotone fa-regular fa-check"
          title="{row.best.descriptionChars} chars"
          aria-hidden="true"
        ></i>{:else}<i
          class="bad fa-sharp-duotone fa-regular fa-xmark"
          aria-hidden="true"
        ></i>{/if}
    </span>
    <span class="num">
      {#if !row.best}—{:else if row.best.activityCount}<span
          class="ok"
          title={row.best.activityTypes.join(', ')}
          >{row.best.activityCount}</span
        >{:else}0{/if}
    </span>
  </div>

  {#if row.note}<p class="note">{row.note}</p>{/if}

  {#if open}
    <div class="matches">
      {#each row.matches as m (m.uuid)}
        <div class="match">
          {@render openButton(m.uuid, m.name)}
          <code class="uuid" title={m.uuid}>{m.uuid}</code>
          <span class="pack">{m.packLabel}</span>
          {@render sourceChip(m, row.candidate.source)}
          <em class="dtype">{m.docType}</em>
          <em class="kind {m.matchKind}"
            >{m.matchKind}{m.matchKind === 'fuzzy'
              ? ` ${Math.round(m.score * 100)}%`
              : ''}</em
          >
          <span class="mchecks">
            <i
              class="fa-sharp-duotone fa-regular fa-image"
              class:ok={m.hasImage}
              class:bad={!m.hasImage}
              title="Artwork"
            ></i>
            <i
              class="fa-sharp-duotone fa-regular fa-file-lines"
              class:ok={m.hasDescription}
              class:bad={!m.hasDescription}
              title="Description"
            ></i>
            <span
              class:ok={m.activityCount > 0}
              class:bad={m.activityCount === 0}
              ><i
                class="fa-sharp-duotone fa-regular fa-bolt"
                aria-hidden="true"
              ></i>{m.activityCount}</span
            >
          </span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .row {
    border-bottom: 1px solid var(--border);
  }
  .rmain {
    display: grid;
    grid-template-columns: var(--report-cols);
    gap: 0.625rem;
    align-items: center;
    padding: 0.5rem 0.625rem;
    font-size: var(--text-sm);
    cursor: default;
  }
  .row:hover .rmain {
    background: var(--bg-hover);
  }
  .num {
    text-align: center;
  }

  .rname {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
  }
  .rname b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
    align-self: center;
  }
  .dot.ok {
    background: var(--ok);
  }
  .dot.incomplete {
    background: var(--gold);
  }
  .dot.ambiguous {
    background: var(--warn);
  }
  .dot.missing {
    background: var(--danger);
  }
  .type,
  .src {
    font-style: normal;
    font-size: var(--text-xs);
    color: var(--text-faint);
    background: var(--bg-elevated);
    border-radius: 0.25rem;
    padding: 0 0.25rem;
    flex-shrink: 0;
  }

  .rwhere {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
    font-size: var(--text-xs);
  }
  .pack {
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dtype {
    font-style: normal;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .msrc {
    flex-shrink: 0;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    background: var(--bg-elevated);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-style: normal;
  }
  .msrc.mismatch {
    background: color-mix(in oklch, var(--danger) 18%, transparent);
    color: var(--danger);
  }
  .msrc.unknown {
    color: var(--text-faint);
  }
  .dtype.mismatch {
    color: var(--warn);
  }
  .kind {
    font-style: normal;
    font-size: var(--hm-text-2xs);
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }
  .kind.fuzzy {
    background: hsl(38 80% 56% / 0.18);
    color: var(--warn);
  }
  .kind.normalized {
    background: var(--bg-elevated);
    color: var(--text-faint);
  }
  .more {
    font-style: normal;
    font-size: var(--text-xs);
    color: var(--gold);
    cursor: pointer;
    flex-shrink: 0;
  }
  .none {
    font-style: normal;
    color: var(--text-faint);
  }

  .ok {
    color: var(--ok);
  }
  .bad {
    opacity: 0.35;
  }

  .note {
    margin: 0 0 0.5rem;
    padding: 0 0.625rem 0 1.625rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .matches {
    padding: 0 0.625rem 0.625rem 1.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .match {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: var(--text-xs);
    background: var(--bg-elevated);
    border-radius: var(--radius-sm);
    padding: 0.25rem 0.5rem;
  }
  .uuid {
    font-family: var(--font-mono);
    font-size: var(--hm-text-2xs);
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 26rem;
  }
  .open-sheet {
    flex-shrink: 0;
    padding: 0 0.125rem;
    background: none;
    border: none;
    color: var(--gold);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .open-sheet:is(:disabled, .stale) {
    color: var(--text-faint);
  }
  .open-sheet:not(:disabled):hover {
    color: var(--text-main);
  }
  .mchecks {
    margin-left: auto;
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
</style>
