<!--
  Add a homebrew file — every brew in the homebrew-repo checkout as a compact
  table, searched and sorted like Manage files. Each row can open in the
  Parser (?repo=<folder>/<file>), scan for errors without being added, or be
  added to the working + Deployed homebrew folders and their index.json.

  Dates come from the repo's index-timestamps.json and authors from the
  "Author; Title.json" filename, so listing 1,000+ brews reads no bodies.
-->
<script lang="ts">
  import type { PageProps } from './$types';
  import {
    errorText,
    formatFileSize,
    formatFolderOutcome,
    formatLocalDate,
    formatNumber,
    type FolderOutcome,
  } from '$lib/util';
  import { BusySet } from '$lib/state/busy-set.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Link from '$lib/ui/Link.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import View from '$lib/ui/View.svelte';
  import FilesHeader from '../FilesHeader.svelte';
  import ScanSummary, { type Scan } from '../ScanSummary.svelte';
  import {
    addHomebrewFromRepo,
    readHomebrewLibraryFile,
    validateFile,
    type LibraryEntry,
  } from '$lib/api';

  let { data }: PageProps = $props();

  type SortKey = 'name' | 'mtime' | 'size';

  let query = $state('');
  let sort = $state<SortKey>('name');
  let scans = $state<Record<string, Scan>>({});
  const scanning = new BusySet();
  const adding = new BusySet();
  // Rows added this visit, so the button disables without re-reading the repo.
  const added = new BusySet();
  let addNote = $state<Record<string, FolderOutcome>>({});

  const keyOf = (e: LibraryEntry) => `${e.folder}/${e.file}`;
  const nameOf = (e: LibraryEntry) => e.names[0] ?? e.file.replace(/\.json$/i, '');

  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    let entries = data.library.entries;
    if (q) {
      entries = entries.filter(
        (e) =>
          nameOf(e).toLowerCase().includes(q) ||
          e.file.toLowerCase().includes(q) ||
          e.authors.toLowerCase().includes(q),
      );
    }
    const copy = entries.slice();
    copy.sort((a, b) => {
      if (sort === 'mtime') return b.mtime - a.mtime;
      if (sort === 'size') return b.size - a.size;
      return nameOf(a).localeCompare(nameOf(b), undefined, {
        sensitivity: 'base',
      });
    });
    return copy;
  });

  async function scan(entry: LibraryEntry) {
    const key = keyOf(entry);
    await scanning.run(key, async () => {
      try {
        const doc = await readHomebrewLibraryFile(entry.folder, entry.file);
        scans = { ...scans, [key]: (await validateFile(doc)).totals };
      } catch (e) {
        scans = { ...scans, [key]: { error: errorText(e) } };
      }
    });
  }

  async function add(entry: LibraryEntry) {
    const key = keyOf(entry);
    await adding.run(key, async () => {
      try {
        const { done, errors } = await addHomebrewFromRepo(
          entry.folder,
          entry.file,
        );
        if (done.length) added.add(entry.file);
        addNote = {
          ...addNote,
          [key]: formatFolderOutcome('Added to', done.length, errors),
        };
      } catch (e) {
        addNote = {
          ...addNote,
          [key]: { ok: false, text: errorText(e) },
        };
      }
    });
  }

  const byline = (e: LibraryEntry) =>
    [
      e.file,
      e.authors,
      e.mtime ? formatLocalDate(e.mtime) : '',
      formatFileSize(e.size),
    ].filter(Boolean);
</script>

<View width="wide">
  <FilesHeader
    title="Add a Homebrew File"
    description="Every brew in your homebrew repo checkout. Scan one before adding it to your homebrew folder."
    current="add"
  />

  <div class="path-bar">
    Repo: <code>{data.library.path || '—'}</code>
    {#if data.library.entries.length}
      <span>{formatNumber(data.library.entries.length)} brews</span>
    {/if}
    <a href="/settings" class="change">Change</a>
  </div>

  {#if data.error}
    <EmptyState variant="error">
      {data.error}. Set the homebrew repo path in <a href="/settings"
        >Settings</a
      >.
    </EmptyState>
  {:else if data.library.entries.length === 0}
    <EmptyState>No brews found in the homebrew repo checkout.</EmptyState>
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
    </div>

    {#if visible.length}
      <table class="library-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each visible as entry (keyOf(entry))}
            {@const key = keyOf(entry)}
            {@const isAdded = entry.installed || added.has(entry.file)}
            <tr>
              <td class="library-name">
                <div class="library-identity">
                  <span class="fname" title={key}>{nameOf(entry)}</span>
                  <span class="fmeta">
                    {#each byline(entry) as part, i (i)}
                      {#if i}<span class="pipe" aria-hidden="true">|</span
                        >{/if}<span>{part}</span>
                    {/each}
                  </span>
                </div>
              </td>
              <td class="library-actions">
                <Link
                  size="small"
                  href="/parser?repo={encodeURIComponent(key)}"
                  >Open in Parser</Link
                >
                <Button
                  size="small"
                  onclick={() => scan(entry)}
                  disabled={scanning.has(key)}
                >
                  {scanning.has(key) ? 'Scanning…' : 'Scan for errors'}
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onclick={() => add(entry)}
                  disabled={isAdded || adding.has(key)}
                  title="Copy this brew into the homebrew + Deployed homebrew folders and list it in each index.json"
                >
                  {isAdded
                    ? 'Added'
                    : adding.has(key)
                      ? 'Adding…'
                      : 'Add to my homebrew'}
                </Button>
              </td>
            </tr>
            {#if scans[key] || addNote[key]?.text}
              <tr class="library-detail">
                <td colspan="2">
                  {#if addNote[key]?.text}
                    <StatusText
                      as="div"
                      variant={addNote[key].ok ? 'ok' : 'error'}
                      >{addNote[key].text}</StatusText
                    >
                  {/if}
                  {#if scans[key]}
                    <div><ScanSummary scan={scans[key]} /></div>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {:else}
      <EmptyState>No brews match “{query}”.</EmptyState>
    {/if}
  {/if}
</View>

<style>
  /* ── Path Bar and Toolbar ───────────────────────────────────────────────── */
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

  /* ── Library Table ──────────────────────────────────────────────────────── */
  .library-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);

    th {
      padding: 0.375rem 0.625rem;
      border-block-end: 1px solid var(--border);
      color: var(--text-muted);
      font-size: var(--text-xs);
      font-weight: var(--font-weight-semibold);
      text-align: start;
    }

    td {
      padding: 0.375rem 0.625rem;
      border-block-end: 1px solid var(--border);
      vertical-align: middle;
    }

    tbody tr:hover {
      background: var(--bg-hover);
    }
  }

  /* Zero max width lets the name column take the slack and still truncate. */
  .library-name {
    inline-size: 100%;
    max-inline-size: 0;
  }

  .library-identity {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .fname {
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .fmeta {
    display: flex;
    align-items: center;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;

    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .pipe {
    flex-shrink: 0;
    color: var(--text-faint);
    margin-inline: 0.5rem;
  }

  .library-actions {
    white-space: nowrap;
    text-align: end;

    :global(.button) {
      margin-inline-start: 0.375rem;
    }
  }

  .library-detail td {
    padding-block-start: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
