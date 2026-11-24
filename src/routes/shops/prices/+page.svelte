<!--
  Shops > Prices - the DM's price list in `content/item-prices.json`.

  Each row prices the items with that name in the sources it lists; `*` (or a
  blank Source) takes every source no other row for the name lists. The Item prices deploy module writes them into the site's
  item data on deploy; min and max only show in the item view's cost hover.
  Rows are edited as text and checked here, so a half-typed cost never saves
  as a number the DM didn't mean.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import { formatNumber, plural } from '$lib/util';
  import {
    getItemNameSources,
    getItemPrices,
    getPriceSeedSources,
    saveItemPrices,
    seedItemPrices,
  } from '$lib/api';
  import {
    mergePrices,
    parsePriceFile,
    parsePriceImport,
    rowKeys,
    rowMatches,
    type ItemPrice,
  } from '$lib/engine/item-prices.ts';

  /** A row as typed. Numbers stay strings until they're checked. */
  interface EditRow {
    id: number;
    name: string;
    source: string;
    cost: string;
    min: string;
    max: string;
  }

  let nextId = 0;
  const toEdit = (r: ItemPrice): EditRow => ({
    id: nextId++,
    name: r.name,
    source: r.source.join(', '),
    cost: String(r.cost),
    min: r.min === undefined ? '' : String(r.min),
    max: r.max === undefined ? '' : String(r.max),
  });
  const toPrice = (r: EditRow): ItemPrice | null =>
    parsePriceFile({ prices: [r] })[0] ?? null;

  let rows = $state<EditRow[]>([]);
  let savedJson = $state('[]');
  let filePath = $state('');
  let loadError = $state('');
  let loaded = $state(false);
  let names = $state<Record<string, string[]> | null>(null);
  let busy = $state(false);
  let banner = $state<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(
    null,
  );
  let search = $state('');
  let seeding = $state(false);
  let seedSources = $state<{ source: string; count: number }[]>([]);
  let seedSource = $state('');
  let fileInput: HTMLInputElement | undefined = $state();

  onMount(async () => {
    try {
      const file = await getItemPrices();
      rows = file.rows.map(toEdit);
      savedJson = JSON.stringify(file.rows);
      filePath = file.path;
      loaded = true;
    } catch (e) {
      loadError = (e as Error).message;
      return;
    }
    // The item catalog is the slow part; the table is usable before it lands.
    getItemNameSources().then(
      (n) => (names = n),
      (e) => (banner = { tone: 'warn', text: `Couldn't list items to match against: ${(e as Error).message}` }),
    );
  });

  // ── Checks ─────────────────────────────────────────────────────────────
  const parsed = $derived(rows.map(toPrice));
  const problems = $derived.by(() => {
    const seen = new Set<string>();
    const out = new Map<number, string>();
    rows.forEach((r, i) => {
      const p = parsed[i];
      if (!p) {
        out.set(r.id, r.name.trim() ? 'Needs a cost' : 'Needs a name');
        return;
      }
      const keys = rowKeys(p);
      const clash = p.source.find((_, k) => seen.has(keys[k]));
      if (clash) out.set(r.id, `Another row for this name has ${clash}`);
      for (const key of keys) seen.add(key);
    });
    return out;
  });
  const valid = $derived(parsed.filter((p): p is ItemPrice => !!p));
  const dirty = $derived(JSON.stringify(valid) !== savedJson || problems.size > 0);
  const matches = $derived(names ? rowMatches(valid, names) : null);
  const matchedCount = $derived(
    matches ? matches.filter((m) => m.length).length : 0,
  );
  /** Each row's index in `valid`, or -1 while it doesn't parse. */
  const validIndex = $derived.by(() => {
    let n = 0;
    return parsed.map((p) => (p ? n++ : -1));
  });

  const rowSources = (i: number): string[] | null =>
    matches && validIndex[i] >= 0 ? matches[validIndex[i]] : null;

  const visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      );
  });

  // ── Actions ────────────────────────────────────────────────────────────
  function addRow() {
    search = '';
    rows = [{ id: nextId++, name: '', source: '', cost: '', min: '', max: '' }, ...rows];
  }

  function removeRow(id: number) {
    rows = rows.filter((r) => r.id !== id);
  }

  /** Lay incoming rows over the current ones, keeping rows that don't parse yet. */
  function mergeIn(incoming: ItemPrice[]): { added: number; updated: number } {
    const before = new Set(valid.flatMap(rowKeys));
    const merged = mergePrices(valid, incoming);
    const pending = rows.filter((r, i) => !parsed[i]);
    rows = [...pending, ...merged.map(toEdit)];
    const updated = incoming.filter((r) => rowKeys(r).some((k) => before.has(k))).length;
    return { added: incoming.length - updated, updated };
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const { rows: incoming, errors } = parsePriceImport(await file.text());
    if (!incoming.length) {
      banner = { tone: 'error', text: `Nothing imported from ${file.name}. ${errors.slice(0, 3).join(' ')}` };
      return;
    }
    const { added, updated } = mergeIn(incoming);
    const skipped = errors.length
      ? ` Skipped ${errors.length}: ${errors.slice(0, 3).join(' ')}${errors.length > 3 ? ' …' : ''}`
      : '';
    banner = {
      tone: errors.length ? 'warn' : 'ok',
      text: `${file.name}: ${added} added, ${updated} updated. Save to keep them.${skipped}`,
    };
  }

  async function openSeed() {
    seeding = true;
    if (seedSources.length) return;
    try {
      seedSources = await getPriceSeedSources();
      seedSource = seedSources[0]?.source ?? '';
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't list homebrew sources: ${(e as Error).message}` };
      seeding = false;
    }
  }

  async function seed() {
    if (!seedSource) return;
    busy = true;
    try {
      const { added, updated } = mergeIn(await seedItemPrices(seedSource));
      banner = {
        tone: 'ok',
        text: `Seeded from ${seedSource}: ${added} added, ${updated} updated. Save to keep them.`,
      };
      seeding = false;
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't seed: ${(e as Error).message}` };
    } finally {
      busy = false;
    }
  }

  const csvCell = (v: string | number | undefined): string => {
    const s = v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  function exportCsv() {
    const lines = [
      'name,source,cost,min,max',
      ...valid.map((r) =>
        [r.name, r.source.join(', '), r.cost, r.min, r.max].map(csvCell).join(','),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'item-prices.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function save() {
    busy = true;
    try {
      const result = await saveItemPrices(valid);
      savedJson = JSON.stringify(valid);
      banner = {
        tone: 'ok',
        text: `Saved ${result.count} ${plural(result.count, 'price', 'prices')}. They reach the site on the next Prepare and deploy.`,
      };
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't save: ${(e as Error).message}` };
    } finally {
      busy = false;
    }
  }

  async function revert() {
    const file = await getItemPrices();
    rows = file.rows.map(toEdit);
    savedJson = JSON.stringify(file.rows);
  }
</script>

<View width="wide">
  <ViewHeader>
    <div class="prices-head">
      <div class="prices-head-text">
        <h1>Prices</h1>
        <p>
          Prices replace an item's cost everywhere on the site when it's
          deployed. Source lists the printings a row prices, separated by
          commas; <code>*</code> (or a blank Source) prices every other printing
          of that name too, so <code>DMG, XDMG, *</code> names the two you
          checked and still covers the rest. Seeding fills in the sources the
          site has for each name.
          A magic variant's price is added to its base item's, so +1 Armor at
          1,500 gp makes +1 Plate 3,000 gp. Min and max are for you: they show
          when you hover a cost in the item view.
        </p>
        {#if loaded}
          <p class="prices-meta">
            {formatNumber(valid.length)}
            {plural(valid.length, 'price', 'prices')}
            {#if matches}&middot; {formatNumber(matchedCount)} matched{:else}&middot;
              matching items…{/if}
            {#if problems.size}&middot;
              <StatusText variant="warning"
                >{problems.size} {plural(problems.size, 'row needs', 'rows need')} fixing</StatusText
              >{/if}
            {#if dirty && !problems.size}&middot;
              <StatusText variant="warning">unsaved changes</StatusText>{/if}
          </p>
        {/if}
      </div>
      <div class="prices-actions">
        <input
          bind:this={fileInput}
          class="prices-file-input"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          onchange={importFile}
        />
        <Button
          disabled={!loaded || busy}
          title="Merge a CSV (name, source, cost, min, max) or a JSON list. Same name and source replaces."
          onclick={() => fileInput?.click()}>Import</Button
        >
        <Button
          disabled={!loaded || busy}
          title="Start from a homebrew source's own item values"
          onclick={openSeed}>Seed from source…</Button
        >
        <Button disabled={!valid.length} onclick={exportCsv}>Export CSV</Button>
        <Button disabled={busy || !dirty} onclick={revert}>Cancel</Button>
        <Button
          variant="primary"
          disabled={busy || !dirty || problems.size > 0}
          title={problems.size ? 'Fix the marked rows first' : `Writes ${filePath}`}
          onclick={save}>{busy ? 'Saving…' : 'Save'}</Button
        >
      </div>
    </div>
  </ViewHeader>

  {#if banner}
    <Banner tone={banner.tone} text={banner.text} ondismiss={() => (banner = null)} />
  {/if}

  {#if seeding}
    <div class="prices-seed">
      {#if seedSources.length}
        <SelectInput bind:value={seedSource} aria-label="Source to seed from">
          {#each seedSources as s (s.source)}
            <option value={s.source}>{s.source} ({s.count} {plural(s.count, 'item', 'items')})</option>
          {/each}
        </SelectInput>
        <Button variant="primary" disabled={busy || !seedSource} onclick={seed}>Seed</Button>
      {:else}
        <StatusText>Looking for homebrew with item values…</StatusText>
      {/if}
      <Button variant="text" onclick={() => (seeding = false)}>Close</Button>
    </div>
  {/if}

  {#if loadError}
    <EmptyState variant="error">Couldn't read the price list: {loadError}</EmptyState>
  {:else if !loaded}
    <EmptyState>Reading prices…</EmptyState>
  {:else}
    <div class="prices-filters">
      <SearchInput bind:value={search} placeholder="Search by name or source" />
      <Button onclick={addRow}>Add row</Button>
    </div>

    {#if !rows.length}
      <EmptyState>
        No prices yet. Import a CSV or JSON file, seed from a homebrew source,
        or add a row.
      </EmptyState>
    {:else}
      <div class="prices-table-wrap">
        <table class="prices-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Source</th>
              <th class="prices-num">Cost (gp)</th>
              <th class="prices-num">Min</th>
              <th class="prices-num">Max</th>
              <th>Matches</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {#each visible as { r, i } (r.id)}
              {@const problem = problems.get(r.id)}
              {@const hit = rowSources(i)}
              <tr class={{ 'prices-row-problem': !!problem }}>
                <td><TextInput bind:value={r.name} aria-label="Name" /></td>
                <td class="prices-source"
                  ><TextInput bind:value={r.source} placeholder="*" aria-label="Sources, separated by commas" /></td
                >
                <td class="prices-num"
                  ><TextInput bind:value={r.cost} inputmode="decimal" aria-label="Cost in gp" /></td
                >
                <td class="prices-num"
                  ><TextInput bind:value={r.min} inputmode="decimal" aria-label="Minimum in gp" /></td
                >
                <td class="prices-num"
                  ><TextInput bind:value={r.max} inputmode="decimal" aria-label="Maximum in gp" /></td
                >
                <td class="prices-matches">
                  {#if problem}
                    <StatusText variant="warning">{problem}</StatusText>
                  {:else if hit === null}
                    <StatusText>…</StatusText>
                  {:else if hit.length}
                    <span title={hit.join(', ')}
                      >{hit.length} <span class="prices-match-sources">({hit.slice(0, 4).join(', ')}{hit.length > 4 ? ', …' : ''})</span></span
                    >
                  {:else}
                    <StatusText variant="warning">No item</StatusText>
                  {/if}
                </td>
                <td class="prices-row-actions">
                  <Button
                    variant="text"
                    size="small"
                    title="Remove this row"
                    aria-label="Remove {r.name || 'row'}"
                    onclick={() => removeRow(r.id)}
                    ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"></i></Button
                  >
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</View>

<style>
  /* ── Prices - Header ──────────────────────────────────────────────────── */
  .prices-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .prices-head-text {
    flex: 1 1 20rem;
    min-inline-size: 0;
  }

  .prices-meta {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .prices-actions,
  .prices-seed,
  .prices-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }

  .prices-file-input {
    display: none;
  }

  /* ── Prices - Seed and Filters ────────────────────────────────────────── */
  .prices-seed {
    margin-block-end: 0.75rem;
  }

  .prices-filters {
    margin-block-end: 0.75rem;

    & :global(.search-input) {
      flex: 1;
      min-inline-size: 14rem;
    }
  }

  /* ── Prices - Table ───────────────────────────────────────────────────── */
  .prices-table-wrap {
    overflow-x: auto;
  }

  .prices-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);

    & :is(th, td) {
      padding-block: 0.25rem;
      padding-inline: 0.375rem;
      border-block-end: 1px solid var(--border);
      text-align: start;
      vertical-align: middle;
    }

    & th {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      background: var(--bg-panel);
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
    }
  }

  .prices-num {
    inline-size: 7rem;
  }

  .prices-source {
    inline-size: 10rem;
  }

  .prices-matches {
    inline-size: 14rem;
    white-space: nowrap;
  }

  .prices-match-sources {
    color: var(--text-muted);
  }

  .prices-row-actions {
    inline-size: 2.5rem;
    text-align: end;
  }

  /* ── Prices - States ──────────────────────────────────────────────────── */
  .prices-row-problem td {
    background: hsl(38 80% 56% / 0.05);
  }
</style>
