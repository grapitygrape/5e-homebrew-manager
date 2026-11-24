<script lang="ts">
  import Badge from '$lib/ui/Badge.svelte';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import Button from '$lib/ui/Button.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import { entryKey, propLabel } from '$lib/engine/blocklist';
  import type { BlocklistEntry, EntryDiagnosis } from '$lib/engine/blocklist';
  import { formatNumber, plural } from '$lib/util';

  let {
    entries = [],
    diagnoses = [],
    loading = false,
    ruleQuery = $bindable(''),
    onremove,
  }: {
    entries?: BlocklistEntry[];
    diagnoses?: EntryDiagnosis[];
    loading?: boolean;
    ruleQuery?: string;
    onremove?: (entry: BlocklistEntry) => void;
  } = $props();

  type SortKey = 'source' | 'category' | 'entry';
  const COLUMNS: { key: SortKey; label: string }[] = [
    { key: 'source', label: 'Source' },
    { key: 'category', label: 'Category' },
    { key: 'entry', label: 'Entry' },
  ];
  let sortKey = $state<SortKey>('source');
  let sortDir = $state<'asc' | 'desc'>('asc');
  let categoryFilter = $state('');

  function sortBy(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = key;
      sortDir = 'asc';
    }
  }

  const sortArrow = (key: SortKey): string =>
    sortKey !== key ? '' : sortDir === 'asc' ? '\u25b2' : '\u25bc';

  const entryLabel = (e: BlocklistEntry) =>
    e.hash === '*' ? 'All' : e.displayName;

  const categoryOptions = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      if (!seen.has(e.category)) seen.set(e.category, propLabel(e.category));
    }
    return [...seen.entries()]
      .map(([prop, label]) => ({ prop, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const visibleRules = $derived.by(() => {
    const q = ruleQuery.trim().toLowerCase();
    let list = categoryFilter
      ? entries.filter((e) => e.category === categoryFilter)
      : entries;
    if (q) {
      list = list.filter(
        (e) =>
          e.source.toLowerCase().includes(q) ||
          e.displayName.toLowerCase().includes(q) ||
          propLabel(e.category).toLowerCase().includes(q),
      );
    }
    const bySource = (a: BlocklistEntry, b: BlocklistEntry) =>
      a.source.localeCompare(b.source);
    const byCategory = (a: BlocklistEntry, b: BlocklistEntry) =>
      propLabel(a.category).localeCompare(propLabel(b.category));
    const byEntry = (a: BlocklistEntry, b: BlocklistEntry) =>
      entryLabel(a).localeCompare(entryLabel(b));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const primary =
        sortKey === 'source'
          ? bySource(a, b)
          : sortKey === 'category'
            ? byCategory(a, b)
            : byEntry(a, b);
      if (primary) return primary * dir;
      // Tiebreakers stay A-Z so equal primaries stay readable.
      if (sortKey !== 'source') {
        const s = bySource(a, b);
        if (s) return s;
      }
      if (sortKey !== 'category') {
        const t = byCategory(a, b);
        if (t) return t;
      }
      return sortKey === 'entry' ? 0 : byEntry(a, b);
    });
  });

  const diagnosisByKey = $derived(new Map(diagnoses.map((d) => [d.key, d])));
  const diagnosisFor = (entry: BlocklistEntry): EntryDiagnosis | undefined =>
    diagnosisByKey.get(entryKey(entry));

  const flagLabel = (d: EntryDiagnosis): string =>
    d.repaired ? 'repaired' : d.code.replace(/-/g, ' ');
</script>

<div class="pane">
  <div class="pane-head">
    <h3>Blocklist</h3>
    <div class="filters">
      <SearchInput bind:value={ruleQuery} placeholder="Filter rules." />
      <SelectInput
        bind:value={categoryFilter}
        disabled={loading}
        aria-label="Category filter"
      >
        <option value="">All categories</option>
        {#each categoryOptions as c (c.prop)}
          <option value={c.prop}>{c.label}</option>
        {/each}
      </SelectInput>
    </div>
  </div>

  {#if loading}
    <p class="muted">Reading content-blocklist.json.</p>
  {:else if entries.length === 0}
    <p class="muted">No rules yet. Tick something on the left.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            {#each COLUMNS as col (col.key)}
              <th
                aria-sort={sortKey === col.key
                  ? sortDir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined}
              >
                <button
                  class="ch"
                  class:on={sortKey === col.key}
                  onclick={() => sortBy(col.key)}
                >
                  {col.label} <span class="arrow">{sortArrow(col.key)}</span>
                </button>
              </th>
            {/each}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each visibleRules as e (entryKey(e))}
            {@const d = diagnosisFor(e)}
            <tr
              class:auto={e.isAuto}
              class:flagged={d && d.level === 'error'}
              class:repaired={d?.repaired}
            >
              <td><SourceTag source={e.source} /></td>
              <td>
                {#if e.category === '*'}
                  <em>All</em>
                {:else}
                  {propLabel(e.category)}
                {/if}
              </td>
              <td>
                {#if e.hash === '*'}
                  <em>All</em>
                {:else}
                  {e.displayName}
                {/if}
                {#if d}
                  <Badge
                    variant={d.level === 'error'
                      ? 'danger'
                      : d.level === 'warning'
                        ? 'warning'
                        : 'default'}
                    title={d.message}>{flagLabel(d)}</Badge
                  >
                {/if}
                {#if e.isAuto}<Badge title="Auto-managed">auto</Badge>{/if}
              </td>
              <td class="align-end">
                <Button
                  size="small"
                  disabled={e.isAuto}
                  onclick={() => onremove?.(e)}>Remove</Button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if ruleQuery || categoryFilter}<p class="hint">
        {formatNumber(visibleRules.length)} of {formatNumber(entries.length)} shown
      </p>{/if}
  {/if}
</div>

<style>
  .pane {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 0 0.875rem 0.875rem;
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

  .filters {
    display: grid;
    grid-template-columns: 1fr minmax(9rem, 0.7fr);
    gap: 0.375rem;
  }
  .filters :global(.search-input),
  .filters :global(.text-input) {
    inline-size: 100%;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm);
  }
  th,
  td {
    text-align: start;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--text-muted);
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .ch {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: inherit;
    font-weight: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    color: inherit;
    cursor: pointer;
    white-space: nowrap;
  }
  .ch:hover {
    color: var(--text-main);
  }
  .ch.on {
    color: var(--gold);
  }
  .arrow {
    font-size: var(--hm-text-2xs);
  }
  tr.auto td {
    color: var(--text-faint);
  }
  tr.flagged td {
    background: hsl(2 70% 56% / 0.07);
  }
  tr.repaired td {
    background: hsl(38 80% 56% / 0.06);
  }
  :global(td .badge) {
    margin-inline-start: 0.375rem;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    cursor: help;
  }
  .align-end {
    text-align: end;
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
