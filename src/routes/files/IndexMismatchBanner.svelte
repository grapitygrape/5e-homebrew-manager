<!--
  IndexMismatchBanner - where the homebrew folder and its index.json disagree:
  files on disk the list doesn't name (keep them, or move them to unused/) and
  list entries with no file (restore from unused/, or drop from the list).
  Each action reloads the listing (services/homebrew-index).
-->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { forget } from '$lib/state/page-cache.svelte.ts';
  import { BusySet } from '$lib/state/busy-set.svelte.ts';
  import { errorText } from '$lib/util';
  import {
    resolveIndexMismatch,
    type IndexMismatch,
    type MismatchAction,
  } from '$lib/api';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';

  let { index }: { index: IndexMismatch | null } = $props();

  const settling = new BusySet();
  let indexError = $state('');

  const restorable = $derived(
    index?.missing.filter((m) => m.inUnused).map((m) => m.file) ?? [],
  );

  /** Keep, move, restore or drop each file, then reload the listing. */
  async function settle(action: MismatchAction, files: string[]) {
    await settling.runAll(files, async () => {
      indexError = '';
      const failed: string[] = [];
      for (const file of files) {
        try {
          await resolveIndexMismatch(action, file);
        } catch (e) {
          failed.push(`${file}: ${errorText(e)}`);
        }
      }
      indexError = failed.join(' · ');
      forget('files', 'files-library', 'dashboard');
      await invalidateAll();
    });
  }
</script>

{#if index?.unlisted.length}
  {@const unlisted = index.unlisted}
  <Banner
    tone="warn"
    text={`${unlisted.length} ${unlisted.length === 1 ? "file isn't" : "files aren't"} in index.json, so the site doesn't load ${unlisted.length === 1 ? 'it' : 'them'}. Keep to add to the list, or move to unused/.`}
  >
    <Button
      size="small"
      disabled={settling.size > 0}
      onclick={() => settle('keep', unlisted)}>Keep all</Button
    >
    <Button
      size="small"
      variant="text"
      disabled={settling.size > 0}
      onclick={() =>
        confirm(`Move ${unlisted.length} file(s) to unused/?`) &&
        settle('unused', unlisted)}>Move all to unused</Button
    >
  </Banner>
  <ul class="index-list" aria-label="Files not in index.json">
    {#each unlisted as file (file)}
      <li>
        <code>{file}</code>
        <Button
          size="small"
          disabled={settling.has(file)}
          onclick={() => settle('keep', [file])}>Keep</Button
        >
        <Button
          size="small"
          variant="text"
          disabled={settling.has(file)}
          onclick={() => settle('unused', [file])}>Move to unused</Button
        >
      </li>
    {/each}
  </ul>
{/if}

{#if index?.missing.length}
  {@const missing = index.missing}
  <Banner
    tone="warn"
    text={`index.json lists ${missing.length} ${missing.length === 1 ? "file that isn't" : "files that aren't"} in this folder. Restore from unused/, or drop from the list.`}
  >
    {#if restorable.length}
      <Button
        size="small"
        disabled={settling.size > 0}
        onclick={() => settle('restore', restorable)}
        >Restore all from unused/</Button
      >
    {/if}
  </Banner>
  <ul class="index-list" aria-label="index.json entries with no file">
    {#each missing as m (m.file)}
      <li>
        <code>{m.file}</code>
        {#if m.inUnused}
          <Button
            size="small"
            disabled={settling.has(m.file)}
            onclick={() => settle('restore', [m.file])}>Restore</Button
          >
        {:else}
          <StatusText variant="warning">Not in unused/ either</StatusText>
        {/if}
        <Button
          size="small"
          variant="text"
          disabled={settling.has(m.file)}
          onclick={() =>
            confirm(`Drop “${m.file}” from index.json?`) &&
            settle('drop', [m.file])}>Drop from list</Button
        >
      </li>
    {/each}
  </ul>
{/if}

{#if indexError}
  <StatusText as="div" class="library-note" variant="error"
    >{indexError}</StatusText
  >
{/if}

<style>
  /* ── Files - Index Mismatch ─────────────────────────────────────────────── */
  .index-list {
    display: flex;
    flex-direction: column;
    gap: var(--hm-space-0-5);
    margin-block: calc(-1 * var(--hm-space-1-5)) 1.25rem;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);

    li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    code {
      margin-inline-end: auto;
    }
  }
</style>
