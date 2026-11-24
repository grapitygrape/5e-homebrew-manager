<!--
  Homebrew Files — the configured folder's files, with on-demand error scans, a
  deep link into the Parser, and a live check against a running Foundry world.
  Scan runs the shared validate-service (through lib/api), so counts match the
  Parser exactly.

  The Foundry check needs the `foundry-homebrew-bridge` module connected from a world
  — a Foundry module can't be called over HTTP, so the world connects out to us
  and we push the query down that stream. The badge in the path bar polls
  /api/foundry/status; the button is disabled until a world is on the line.
  A world the allowlist refused gets an Allow button beside the badge, and the
  report can open a matched item's sheet in that world.

  Deploy copies the file into Settings' Foundry homebrew and/or Deployed
  homebrew folders (overwrite). The button is omitted when neither is a local path.

  Add a homebrew file (files/add) lists the homebrew-repo checkout and copies a
  brew into the live folders. Remove moves a file into each folder's unused/
  and drops it from index.json.

  The folder and index.json should always match, and only this page changes
  either. Files dropped in by hand, or list entries with no file, show in a
  notice at the top to keep or move, restore or drop (services/homebrew-index).

  Submission lint (/api/lint) runs the homebrew repo's CI rules against one
  file and lists that file's collisions; "Check collisions" (/api/collisions)
  sweeps the whole folder for silent overrides and clashing source ids.

  PIECES. HomebrewFileRow draws one file, IndexMismatchBanner the index.json
  notice; the per-file actions and their results are in state/files-page.
-->

<script lang="ts">
  import type { PageProps } from './$types';
  import FoundryReportModal from '$lib/components/FoundryReportModal.svelte';
  import { FilesPage } from '$lib/state/files-page.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import View from '$lib/ui/View.svelte';
  import FilesHeader from './FilesHeader.svelte';
  import HomebrewFileRow from './HomebrewFileRow.svelte';
  import IndexMismatchBanner from './IndexMismatchBanner.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import CheckIssueList from '$lib/components/checks/CheckIssueList.svelte';
  import { setIndexMismatch } from '$lib/state/index-mismatch.svelte.ts';

  let { data }: PageProps = $props();

  type SortKey = 'name' | 'mtime' | 'size';

  const page = new FilesPage();
  const bridge = $derived(page.bridge);
  let query = $state('');
  let sort = $state<SortKey>('name');

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let files = data.homebrew.files;
    if (q) {
      files = files.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.file.toLowerCase().includes(q) ||
          f.authors.toLowerCase().includes(q),
      );
    }
    const copy = files.slice();
    copy.sort((a, b) => {
      if (sort === 'mtime') return (b.mtime || 0) - (a.mtime || 0);
      if (sort === 'size') return b.size - a.size;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    return copy;
  });

  // The nav badge follows this page's listing, so the two never disagree.
  $effect(() => setIndexMismatch(data.index));
</script>

<View width="wide" class="files-page">
  <FilesHeader
    title="Homebrew Files"
    description="Homebrew files in your configured folder, with on-demand error scans."
    current="manage"
    canDeploy={data.canDeploy}
  />

  <div class="path-bar">
    Folder: <code>{data.homebrew.path || '—'}</code>

    <span
      class="bridge"
      class:live={bridge.connected}
      class:refused={!bridge.connected && bridge.refused.length > 0}
      title={page.bridgeTitle}
    >
      <span class="bdot"></span>
      {#if bridge.connected}Foundry: {page.worldLabel}{:else if bridge.refused.length}Foundry
        world refused{:else}Foundry bridge offline{/if}
    </span>

    {#each bridge.refused as r (r.origin)}
      <Button
        size="small"
        class="allow"
        title="Add {r.origin} to Settings → Foundry URL"
        disabled={page.allowing !== null}
        onclick={() => page.allow(r.origin)}
        >{page.allowing === r.origin
          ? 'Allowing…'
          : `Allow ${r.origin}`}</Button
      >
    {/each}
    {#if page.allowError}<StatusText variant="error"
        >{page.allowError}</StatusText
      >{/if}

    {#if bridge.clients.length > 1}
      <SelectInput
        class="wpick"
        bind:value={page.clientId}
        aria-label="Which Foundry world to check"
      >
        {#each bridge.clients as c (c.clientId)}<option value={c.clientId}
            >{c.world}</option
          >{/each}
      </SelectInput>
    {/if}

    <a href="/settings" class="change">Change</a>
  </div>

  <IndexMismatchBanner index={data.index} />

  {#if !data.homebrew.exists}
    <EmptyState>
      Folder not found. Set a valid homebrew path in <a href="/settings"
        >Settings</a
      >.
    </EmptyState>
  {:else if data.homebrew.files.length === 0}
    <EmptyState>
      No homebrew <code>.json</code> files in this folder.
    </EmptyState>
  {:else}
    <div class="toolbar">
      <SearchInput
        class="search"
        bind:value={query}
        placeholder="Search name, filename, or author"
        aria-label="Search name, filename, or author"
      />
      <label class="sort">
        Sort
        <SelectInput bind:value={sort} aria-label="Sort files">
          <option value="name">Name</option>
          <option value="mtime">Last updated</option>
          <option value="size">Size</option>
        </SelectInput>
      </label>
      <Button
        onclick={page.toggleCollisions}
        disabled={page.loadingCollisions}
        title="Duplicate names+sources across brews and official data, and source ids that clash with official books, each other, or published homebrew-repo brews"
      >
        {page.loadingCollisions ? 'Checking…' : 'Check collisions'}
      </Button>
    </div>

    {#if page.libraryNote}
      <StatusText
        as="div"
        class="library-note"
        variant={page.libraryNote.ok ? 'ok' : 'error'}
        >{page.libraryNote.text}</StatusText
      >
    {/if}

    {#if page.collisionsOpen && page.collisionReport}
      <section class="collisions" aria-label="Collisions">
        {#if 'error' in page.collisionReport}
          <StatusText variant="error"
            >Collision check failed — {page.collisionReport.error}</StatusText
          >
        {:else}
          <div class="chead">
            <strong>Collisions</strong>
            <StatusText
              variant={page.collisionReport.totals.errors ? 'error' : 'ok'}
              >{page.collisionReport.totals.errors}
              {page.collisionReport.totals.errors === 1
                ? 'error'
                : 'errors'}</StatusText
            >
            ·
            <StatusText
              variant={page.collisionReport.totals.warnings
                ? 'warning'
                : 'default'}
              >{page.collisionReport.totals.warnings}
              {page.collisionReport.totals.warnings === 1
                ? 'warning'
                : 'warnings'}</StatusText
            >
            · {page.collisionReport.totals.files} files
            <Button
              size="small"
              variant="text"
              onclick={() => page.loadCollisions(true)}
              disabled={page.loadingCollisions}>Re-scan</Button
            >
          </div>
          {#if page.collisionReport.collisions.length}
            <CheckIssueList
              collisions={page.collisionReport.collisions}
              showFiles
            />
          {:else}
            <StatusText variant="ok"
              >No collisions — every name+source and source id is unique.</StatusText
            >
          {/if}
        {/if}
      </section>
    {/if}

    <div class="flist">
      {#each visible as f (f.file)}
        <HomebrewFileRow
          {f}
          upstream={data.upstream[f.file]}
          canDeploy={data.canDeploy}
          {page}
        />
      {:else}
        <EmptyState>No files match “{query}”.</EmptyState>
      {/each}
    </div>
  {/if}
</View>

{#if page.report}
  <FoundryReportModal
    report={page.report}
    onclose={() => (page.report = null)}
    onopen={page.openMatch}
  />
{/if}

<style>
  .path-bar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-bottom: 1.25rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  .path-bar .change {
    margin-inline-start: auto;
  }

  .bridge {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.5rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: var(--text-xs);
    color: var(--text-faint);
    cursor: help;
  }
  .bridge.live {
    color: var(--ok);
    border-color: hsl(140 45% 50% / 0.45);
  }
  .bdot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--text-faint);
  }
  .bridge.live .bdot {
    background: var(--ok);
    box-shadow: 0 0 0 0.25rem hsl(140 45% 50% / 0.18);
  }
  .bridge.refused {
    color: var(--warn);
    border-color: color-mix(in oklch, var(--warn) 45%, transparent);
  }
  .bridge.refused .bdot {
    background: var(--warn);
  }
  .path-bar :global(.allow) {
    font-size: var(--text-xs);
    padding-block: 0.125rem;
  }
  .path-bar :global(.wpick) {
    background: var(--bg-elevated);
    color: var(--text-main);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    padding: 0.125rem 0.25rem;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.875rem;
  }
  .toolbar :global(.search) {
    flex: 1;
    min-width: 0;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* Flat rows like the source browser: name, then the byline under it. */
  .flist {
    --file-chev-size: 0.75rem;
    --file-pad-inline: var(--hm-space-1-5);

    border-block-start: 1px solid var(--border);
  }
  .collisions {
    margin-bottom: 0.875rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    font-size: var(--text-sm);
  }
  .chead {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .toolbar + :global(.library-note) {
    margin-bottom: 0.875rem;
    font-size: var(--text-sm);
  }
</style>
