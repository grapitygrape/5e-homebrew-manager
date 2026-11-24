<!--
  Shops > Lists - the shop files in `content/shops/`, one per shop.

  Items reach a shop from the Site Browser's items page (the shop button on an
  item or the pinned list), which writes the file at once and tells this page
  to reload. Here a shop is renamed, its counts changed or items removed, and
  only Save writes those. Each file is a 5etools items list, so Export gives a
  file the site's own Load list opens.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import { formatNumber, plural } from '$lib/util';
  import { formatValue, itemTypeLabel } from '$lib/engine';
  import type { ShopRow, SpellOffer, UnresolvedReason } from '$lib/engine';
  import {
    createShop,
    deleteShop,
    getShops,
    importShop,
    openShop,
    saveShop,
    type ShopFile,
    type ShopSummary,
  } from '$lib/api';
  import {
    isSpellEntry,
    siteListExport,
    type ShopEntry,
  } from '$lib/engine/shop-list.ts';
  import { isTauri, onSiteShopsChanged, openSiteBrowser } from '$lib/tauri-bridge';

  /** An entry as edited, with what it resolved to. Count and cost stay text while typed. */
  interface EditRow {
    id: number;
    entry: ShopEntry;
    row: ShopRow;
    count: string;
    /** gp; blank charges the item's own cost. */
    cost: string;
    as: SpellOffer;
  }

  const REASONS: Record<UnresolvedReason, { text: string; title: string }> = {
    site: {
      text: 'From the site',
      title: "The manager's item list doesn't have this (a magic variant the site builds, for one). It shows what the site showed when it was added.",
    },
    blocklisted: { text: 'Blocklisted', title: 'Choose Content hides this now, so it stays out of the total.' },
    stale: { text: 'Not found', title: 'Nothing with this name and source is loaded.' },
  };

  const levelText = (level: number | null): string =>
    level === null
      ? ''
      : level === 0
        ? 'Cantrip'
        : `${level}${['th', 'st', 'nd', 'rd'][level] ?? 'th'} level`;

  /** Object keys sorted, so a file Rust wrote compares equal to the same shop edited here. */
  const canon = (value: unknown): string =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    );

  const gpText = (cp: number | null): string => (cp === null ? '' : String(cp / 100));

  let shops = $state<ShopSummary[]>([]);
  let folder = $state('');
  let listError = $state('');
  let listed = $state(false);

  let openFile = $state('');
  let shop = $state<ShopFile | null>(null);
  let name = $state('');
  let rows = $state<EditRow[]>([]);
  let savedJson = $state('');
  let opening = $state(false);
  let openError = $state('');

  let newName = $state('');
  let busy = $state(false);
  let banner = $state<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  let fileInput: HTMLInputElement | undefined = $state();
  let nextId = 0;

  const countOf = (r: EditRow): number | null => {
    const n = Number(r.count);
    return Number.isInteger(n) && n >= 1 ? n : null;
  };

  /** The typed cost in gp: undefined when blank, null when it isn't a number. */
  const costOf = (r: EditRow): number | undefined | null => {
    if (!r.cost.trim()) return undefined;
    const n = Number(r.cost);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const isBad = (r: EditRow): boolean => countOf(r) === null || costOf(r) === null;

  /** What a row charges in copper, or null: blocklisted rows charge nothing. */
  const chargeCp = (r: EditRow): number | null => {
    if (r.row.unresolvedReason === 'blocklisted') return null;
    const cost = costOf(r);
    return typeof cost === 'number' ? Math.round(cost * 100) : r.row.baseValueCp;
  };

  function toEntry(r: EditRow): ShopEntry {
    const { cost: _cost, as: _as, ...rest } = r.entry;
    const entry: ShopEntry = { ...rest, c: countOf(r)! };
    const cost = costOf(r);
    if (typeof cost === 'number') entry.cost = cost;
    // Scroll is the default, so only a service is written.
    if (isSpellEntry(r.entry) && r.as === 'spell') entry.as = 'spell';
    return entry;
  }

  /** The shop as it would be saved, or null while a count or cost doesn't parse. */
  const edited = $derived.by((): ShopFile | null => {
    if (!shop || rows.some(isBad)) return null;
    return { ...shop, name: name.trim() || shop.name, items: rows.map(toEntry) };
  });
  const dirty = $derived(!!shop && (!edited || canon(edited) !== savedJson));
  const badRows = $derived(rows.filter(isBad).length);
  const total = $derived(
    rows.reduce((sum, r) => sum + (chargeCp(r) ?? 0) * (countOf(r) ?? 0), 0),
  );
  const unpriced = $derived(
    rows.filter((r) => chargeCp(r) === null && r.row.unresolvedReason !== 'blocklisted').length,
  );
  const spellCount = $derived(rows.filter((r) => r.row.kind === 'spell').length);

  async function loadList() {
    try {
      const listing = await getShops();
      shops = listing.shops;
      folder = listing.path;
      listError = '';
    } catch (e) {
      listError = (e as Error).message;
    } finally {
      listed = true;
    }
  }

  async function open(file: string) {
    if (dirty && file !== openFile && !confirm(`Drop the unsaved changes to “${shop?.name}”?`)) return;
    opening = true;
    openError = '';
    try {
      const opened = await openShop(file);
      openFile = file;
      shop = opened.shop;
      name = opened.shop.name;
      rows = opened.shop.items.map((entry, i) => ({
        id: nextId++,
        entry,
        row: opened.rows[i],
        count: String(entry.c),
        cost: entry.cost === undefined ? '' : String(entry.cost),
        as: entry.as === 'spell' ? 'spell' : 'scroll',
      }));
      savedJson = canon(opened.shop);
    } catch (e) {
      openError = (e as Error).message;
    } finally {
      opening = false;
    }
  }

  onMount(() => {
    void loadList().then(() => {
      if (shops[0] && !shops[0].error) void open(shops[0].file);
    });
    const unlisten = onSiteShopsChanged((file) => void siteChanged(file));
    return () => void unlisten.then((stop) => stop());
  });

  async function siteChanged(file: string) {
    await loadList();
    if (file !== openFile && openFile) return;
    if (!openFile || !dirty) {
      await open(file);
      return;
    }
    banner = {
      tone: 'warn',
      text: `The Site Browser added to “${shop?.name}” while it had unsaved changes. Save keeps yours and drops the site's; Cancel loads the site's.`,
    };
  }

  // ── Actions ────────────────────────────────────────────────────────────
  async function addShop() {
    if (!newName.trim()) return;
    busy = true;
    try {
      const made = await createShop(newName);
      newName = '';
      await loadList();
      await open(made.file);
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't make the shop: ${(e as Error).message}` };
    } finally {
      busy = false;
    }
  }

  async function importFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    busy = true;
    try {
      const made = await importShop(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''));
      await loadList();
      await open(made.file);
      banner = {
        tone: 'ok',
        text: `Imported ${file.name} as “${made.name}”, ${made.count} ${plural(made.count, 'item', 'items')}.`,
      };
    } catch (err) {
      banner = { tone: 'error', text: `Couldn't import ${file.name}: ${(err as Error).message}` };
    } finally {
      busy = false;
    }
  }

  function removeRow(id: number) {
    rows = rows.filter((r) => r.id !== id);
  }

  async function save() {
    if (!edited) return;
    busy = true;
    try {
      await saveShop(openFile, edited);
      savedJson = canon(edited);
      shop = edited;
      banner = { tone: 'ok', text: `Saved “${edited.name}”.` };
      await loadList();
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't save: ${(e as Error).message}` };
    } finally {
      busy = false;
    }
  }

  const revert = () => open(openFile);

  async function remove() {
    if (!shop || !confirm(`Delete “${shop.name}”? The file is kept as ${openFile}.bak.`)) return;
    busy = true;
    try {
      await deleteShop(openFile);
      banner = { tone: 'ok', text: `Deleted “${shop.name}”. ${openFile}.bak in the shops folder still has it.` };
      openFile = '';
      shop = null;
      rows = [];
      await loadList();
    } catch (e) {
      banner = { tone: 'error', text: `Couldn't delete: ${(e as Error).message}` };
    } finally {
      busy = false;
    }
  }

  function exportFile() {
    if (!edited) return;
    const url = URL.createObjectURL(
      new Blob([siteListExport(edited)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = openFile;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<View width="wide">
  <ViewHeader>
    <div class="lists-head">
      <div class="lists-head-text">
        <h1>Lists</h1>
        <p>
          A shop is a list of items and spells, and how many of each. Add to one
          from the Site Browser: on the Items or Spells page, the shop button on
          the entry, or beside the pinned list for everything pinned. Adding
          something a shop already has adds to its count. A spell sells as a
          scroll or as spellcasting. Cost is what this shop charges, in gp; leave
          it blank for the item's own. Export gives a file the site's Load list
          opens, items only.
        </p>
        {#if folder}<p class="lists-meta">Saved in <code>{folder}</code></p>{/if}
      </div>
      <div class="lists-actions">
        {#if isTauri()}
          <Button onclick={() => void openSiteBrowser()}>Open Site Browser</Button>
        {/if}
        <input
          bind:this={fileInput}
          class="lists-file-input"
          type="file"
          accept=".json,application/json"
          onchange={importFile}
        />
        <Button
          disabled={busy}
          title="Make a shop from a list exported from the site (Export list on a pinned items list)"
          onclick={() => fileInput?.click()}>Import list</Button
        >
      </div>
    </div>
  </ViewHeader>

  {#if banner}
    <Banner tone={banner.tone} text={banner.text} ondismiss={() => (banner = null)} />
  {/if}

  {#if listError}
    <EmptyState variant="error">Couldn't read the shops: {listError}</EmptyState>
  {:else if !listed}
    <EmptyState>Reading shops…</EmptyState>
  {:else}
    <div class="lists-layout">
      <nav class="lists-side" aria-label="Shops">
        <form
          class="lists-new"
          onsubmit={(e) => {
            e.preventDefault();
            void addShop();
          }}
        >
          <TextInput bind:value={newName} placeholder="New shop name" aria-label="New shop name" />
          <Button type="submit" disabled={busy || !newName.trim()}>Add</Button>
        </form>
        {#each shops as s (s.file)}
          <button
            type="button"
            class="lists-shop"
            aria-current={s.file === openFile ? 'true' : undefined}
            title={s.error ?? s.file}
            onclick={() => void open(s.file)}
          >
            <span class="lists-shop-name">{s.name}</span>
            {#if s.error}
              <StatusText variant="warning">Unreadable</StatusText>
            {:else}
              <span class="lists-shop-count">{formatNumber(s.count)}</span>
            {/if}
          </button>
        {:else}
          <p class="lists-side-empty">No shops yet.</p>
        {/each}
      </nav>

      <section class="lists-main">
        {#if openError}
          <EmptyState variant="error">Couldn't open the shop: {openError}</EmptyState>
        {:else if opening && !shop}
          <EmptyState>Opening…</EmptyState>
        {:else if !shop}
          <EmptyState>
            {shops.length ? 'Choose a shop.' : 'Name a shop to start one, or add items from the Site Browser.'}
          </EmptyState>
        {:else}
          <div class="lists-shop-head">
            <TextInput class="lists-name" bind:value={name} aria-label="Shop name" />
            <div class="lists-actions">
              <Button
                disabled={!edited}
                title={spellCount
                  ? "For the site's Load list on the Items page; spells are left out"
                  : "For the site's Load list on the Items page"}
                onclick={exportFile}>Export</Button
              >
              <Button disabled={busy} onclick={remove}>Delete</Button>
              <Button disabled={busy || !dirty} onclick={revert}>Cancel</Button>
              <Button
                variant="primary"
                disabled={busy || !dirty || !edited}
                title={badRows ? 'Fix the marked rows first' : undefined}
                onclick={save}>{busy ? 'Saving…' : 'Save'}</Button
              >
            </div>
          </div>
          <p class="lists-meta">
            {formatNumber(rows.length)}
            {plural(rows.length, 'entry', 'entries')} &middot; {formatValue(total || null)} in all
            {#if unpriced}&middot; {unpriced} without a cost{/if}
            {#if badRows}&middot;
              <StatusText variant="warning"
                >{badRows} {plural(badRows, 'row needs', 'rows need')} fixing</StatusText
              >{:else if dirty}&middot; <StatusText variant="warning">unsaved changes</StatusText>{/if}
          </p>

          {#if !rows.length}
            <EmptyState>
              Nothing in this shop yet. Add from the Site Browser's Items or Spells page.
            </EmptyState>
          {:else}
            <div class="lists-table-wrap">
              <table class="lists-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th class="lists-num">Qty</th>
                    <th class="lists-num">Cost (gp)</th>
                    <th class="lists-num">Weight</th>
                    <th aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each rows as r (r.id)}
                    {@const reason = r.row.unresolvedReason}
                    <tr class={{ 'lists-row-problem': isBad(r) }}>
                      <td>
                        <span class="lists-item">
                          {r.row.name}
                          {#if reason}
                            <StatusText
                              variant={reason === 'site' ? 'default' : 'warning'}
                              title={REASONS[reason].title}>{REASONS[reason].text}</StatusText
                            >
                          {/if}
                        </span>
                      </td>
                      <td>{r.row.source}</td>
                      <td>
                        {#if r.row.kind === 'spell'}
                          <span class="lists-spell">
                            <SelectInput bind:value={r.as} aria-label="Sell {r.row.name} as">
                              <option value="scroll">Scroll</option>
                              <option value="spell">Spell</option>
                            </SelectInput>
                            <span class="lists-level">{levelText(r.row.level)}</span>
                          </span>
                        {:else}
                          {r.row.found ? itemTypeLabel(r.row.type) : '—'}
                        {/if}
                      </td>
                      <td class="lists-num">
                        <TextInput bind:value={r.count} inputmode="numeric" aria-label="Quantity of {r.row.name}" />
                      </td>
                      <td class="lists-num">
                        <TextInput
                          bind:value={r.cost}
                          inputmode="decimal"
                          placeholder={gpText(r.row.baseValueCp) || '—'}
                          title={r.row.baseValueCp === null
                            ? 'What this shop charges, in gp'
                            : `What this shop charges, in gp. Blank charges the item's own ${formatValue(r.row.baseValueCp)}.`}
                          aria-label="Cost in gp of {r.row.name}"
                        />
                      </td>
                      <td class="lists-num">{r.row.weight != null ? `${r.row.weight} lb.` : '—'}</td>
                      <td class="lists-row-actions">
                        <Button
                          variant="text"
                          size="small"
                          title="Remove from this shop"
                          aria-label="Remove {r.row.name}"
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
      </section>
    </div>
  {/if}
</View>

<style>
  /* ── Lists - Header ───────────────────────────────────────────────────── */
  .lists-head,
  .lists-shop-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .lists-head-text {
    flex: 1 1 20rem;
    min-inline-size: 0;
  }

  .lists-meta {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .lists-actions,
  .lists-new {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem;
  }

  .lists-file-input {
    display: none;
  }

  /* ── Lists - Layout ───────────────────────────────────────────────────── */
  .lists-layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
    gap: 1.5rem;
    align-items: start;
  }

  /* ── Lists - Shops ────────────────────────────────────────────────────── */
  .lists-side {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .lists-new {
    flex-wrap: nowrap;
    margin-block-end: 0.5rem;

    & :global(.text-input) {
      flex: 1;
      min-inline-size: 0;
    }
  }

  .lists-shop {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block: 0.375rem;
    padding-inline: 0.625rem;
    border: 0;
    border-inline-start: 2px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-main);
    font: inherit;
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;

    &:hover {
      background: var(--bg-panel);
    }

    &[aria-current='true'] {
      border-inline-start-color: var(--gold);
      background: var(--bg-panel);
    }
  }

  .lists-shop-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lists-shop-count,
  .lists-side-empty {
    color: var(--text-muted);
  }

  .lists-side-empty {
    font-size: var(--text-sm);
  }

  /* ── Lists - Open Shop ────────────────────────────────────────────────── */
  .lists-main {
    min-inline-size: 0;
  }

  .lists-shop-head :global(.lists-name) {
    flex: 1 1 16rem;
    font-size: var(--text-lg);
    font-weight: var(--font-weight-semibold);
  }

  /* ── Lists - Table ────────────────────────────────────────────────────── */
  .lists-table-wrap {
    overflow-x: auto;
  }

  .lists-table {
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

  .lists-num {
    inline-size: 6rem;
  }

  .lists-item,
  .lists-spell {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }

  .lists-spell {
    align-items: center;
    flex-wrap: nowrap;
  }

  .lists-level {
    color: var(--text-muted);
    white-space: nowrap;
  }

  .lists-row-actions {
    inline-size: 2.5rem;
    text-align: end;
  }

  /* ── Lists - States ───────────────────────────────────────────────────── */
  .lists-row-problem td {
    background: hsl(38 80% 56% / 0.05);
  }
</style>
