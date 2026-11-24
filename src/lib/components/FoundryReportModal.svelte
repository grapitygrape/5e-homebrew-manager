<!--
  FoundryReportModal — "Check Foundry" results for one homebrew file.
  Summary strip, status filters, toolbar, and a scrollable table of
  FoundryReportRow items.
-->
<script lang="ts">
  import type { CheckResponse } from '$lib/api';
  import { formatNumber } from '$lib/util';
  import {
    BRIDGE_FEATURES,
    type ReportRow,
    type RowStatus,
  } from '$lib/engine/foundry/types.ts';
  import { sortRows } from '$lib/engine/foundry/report.ts';
  import Button from '$lib/ui/Button.svelte';
  import FoundryReportRow from './FoundryReportRow.svelte';

  interface Props {
    report: CheckResponse;
    onclose: () => void;
    /** Open a document's sheet in Foundry; rejects with a message to show. */
    onopen?: (uuid: string) => Promise<void>;
  }

  let { report, onclose, onopen }: Props = $props();

  const canOpen = $derived(
    !!onopen && (report.client.features ?? []).includes(BRIDGE_FEATURES.open),
  );
  const openTitle = $derived(
    canOpen
      ? `Open in ${report.world}`
      : 'The bridge module in this world is too old to open sheets. Deploy it from Settings → Deployment, then reload the world.',
  );

  let opening = $state<string | null>(null);
  let openNote = $state<{ ok: boolean; text: string } | null>(null);

  async function openSheet(uuid: string, name: string) {
    if (!onopen) return;
    if (!canOpen) {
      openNote = { ok: false, text: openTitle };
      return;
    }
    opening = uuid;
    openNote = null;
    try {
      await onopen(uuid);
      openNote = { ok: true, text: `Opened ${name} in Foundry.` };
    } catch (e) {
      openNote = { ok: false, text: (e as Error).message };
    } finally {
      opening = null;
    }
  }

  const STATUS_LABEL: Record<RowStatus, string> = {
    missing: 'Missing',
    ambiguous: 'Ambiguous',
    incomplete: 'Incomplete',
    ok: 'Complete',
  };

  /** Worst first — the same order the row list uses. */
  const STATUSES: RowStatus[] = ['missing', 'ambiguous', 'incomplete', 'ok'];

  let filter = $state<RowStatus | 'all'>('all');
  let expanded = $state<Set<string>>(new Set());
  let copied = $state(false);

  const ordered = $derived(sortRows(report.rows));
  const visible = $derived(
    filter === 'all' ? ordered : ordered.filter((r) => r.status === filter),
  );

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expanded = next;
  }

  async function copyJson() {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  /** Uniquely names a row even when two entries share a name across types. */
  const rowKey = (r: ReportRow) => r.candidate.id;

  const pct = (n: number) =>
    report.summary.total ? Math.round((n / report.summary.total) * 100) : 0;
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>

<div
  class="modal"
  role="dialog"
  aria-modal="true"
  aria-label="Foundry check results"
>
  <header>
    <div>
      <h2>Foundry check — {report.file}</h2>
      <p class="sub">
        <b>{report.world}</b>
        {#if report.system}<span class="chip-mini">{report.system}</span>{/if}
        · searched {formatNumber(report.searched.documents)} items across {report
          .searched.packs}
        {report.searched.packs === 1 ? 'source' : 'sources'} · {report.elapsedMs}
        ms
      </p>
    </div>
    <button class="icon" onclick={onclose} aria-label="Close"
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  </header>

  <div class="summary">
    {#each STATUSES as s (s)}
      <button
        class="stat {s}"
        class:active={filter === s}
        onclick={() => (filter = filter === s ? 'all' : s)}
        disabled={report.summary[s] === 0}
      >
        <b>{report.summary[s]}</b>
        <span>{STATUS_LABEL[s]}</span>
        <em>{pct(report.summary[s])}%</em>
      </button>
    {/each}
    <div class="gaps">
      <span title="Best match has a placeholder or empty image"
        ><i class="fa-sharp-duotone fa-regular fa-image" aria-hidden="true"></i>
        {report.summary.noImage} no art</span
      >
      <span title="Best match has an empty description"
        ><i class="fa-sharp-duotone fa-regular fa-file-lines" aria-hidden="true"
        ></i>
        {report.summary.noDescription} no text</span
      >
      <span
        title="Best match has zero Activities — often fine for passive items"
        ><i class="fa-sharp-duotone fa-regular fa-bolt" aria-hidden="true"></i>
        {report.summary.noActivities} no activities</span
      >
    </div>
  </div>

  <div class="toolbar">
    <span class="showing">
      Showing {visible.length} of {report.summary.total}
      {#if filter !== 'all'}<button
          class="link"
          onclick={() => (filter = 'all')}>clear filter</button
        >{/if}
    </span>
    {#if openNote}<span class="open-note" class:failed={!openNote.ok}
        >{openNote.text}</span
      >{/if}
    <Button size="small" class="copy-json" onclick={copyJson}
      >{copied ? 'Copied' : 'Copy JSON'}</Button
    >
  </div>

  <div class="rows">
    <div class="rhead">
      <span>Homebrew entry</span>
      <span>Found in</span>
      <span class="num" title="Artwork"
        ><i class="fa-sharp-duotone fa-regular fa-image" aria-hidden="true"
        ></i></span
      >
      <span class="num" title="Description"
        ><i class="fa-sharp-duotone fa-regular fa-file-lines" aria-hidden="true"
        ></i></span
      >
      <span class="num" title="Activities"
        ><i class="fa-sharp-duotone fa-regular fa-bolt" aria-hidden="true"
        ></i></span
      >
    </div>

    {#each visible as row (rowKey(row))}
      <FoundryReportRow
        {row}
        open={expanded.has(rowKey(row))}
        statusLabel={STATUS_LABEL[row.status]}
        {canOpen}
        {openTitle}
        {opening}
        ontoggle={() => toggle(rowKey(row))}
        onopen={onopen ? (uuid, name) => void openSheet(uuid, name) : undefined}
      />
    {:else}
      <div class="empty">No entries match this filter.</div>
    {/each}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim-bg);
    z-index: var(--z-modal-scrim);
  }
  .modal {
    position: fixed;
    inset: 3vh 4vw;
    z-index: var(--z-modal);
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--modal-shadow);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem 1.25rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  header h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-tight);
  }
  .sub {
    margin: 0.25rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .chip-mini {
    background: var(--bg-elevated);
    border-radius: 0.25rem;
    padding: 0 0.375rem;
    font-size: var(--text-xs);
    margin-left: 0.375rem;
  }
  .icon {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
    padding: 0.25rem 0.375rem;
  }
  .icon:hover {
    color: var(--text-main);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border);
  }
  .stat {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    cursor: pointer;
    background: var(--bg-elevated);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    padding: 0.375rem 0.75rem;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-family: inherit;
  }
  .stat b {
    font-size: var(--text-base);
    color: var(--text-main);
  }
  .stat em {
    font-style: normal;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
  .stat:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stat.active {
    border-color: var(--gold);
  }
  .stat.missing b {
    color: var(--danger);
  }
  .stat.ambiguous b {
    color: var(--warn);
  }
  .stat.incomplete b {
    color: var(--gold);
  }
  .stat.ok b {
    color: var(--ok);
  }
  .gaps {
    margin-left: auto;
    display: flex;
    gap: 0.75rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 1.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .toolbar .showing {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .link {
    background: none;
    border: none;
    color: var(--gold);
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
    padding: 0;
  }
  .open-note {
    color: var(--ok);
  }
  .open-note.failed {
    color: var(--danger);
  }
  .toolbar :global(.copy-json) {
    margin-left: auto;
    font-size: var(--text-xs);
    padding: 0.25rem 0.625rem;
  }

  .rows {
    --report-cols: minmax(220px, 2fr) minmax(200px, 2fr) 3rem 3rem 3.5rem;
    flex: 1;
    overflow-y: auto;
    padding: 0 1.25rem 1.25rem;
  }
  .rhead {
    display: grid;
    grid-template-columns: var(--report-cols);
    gap: 0.625rem;
    align-items: center;
    position: sticky;
    top: 0;
    background: var(--bg-panel);
    padding: 0.5rem 0.625rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--text-faint);
    border-bottom: 1px solid var(--border);
    z-index: 1;
  }
  .num {
    text-align: center;
  }

  .empty {
    padding: 2rem;
    text-align: center;
    color: var(--text-faint);
  }
</style>
