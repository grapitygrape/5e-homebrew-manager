<!--
  BlocklistHeader — title, rule count + dirty/missing status, and Import /
  Export / Cancel / Save / Deploy actions for `/blocklist`.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import type { BlocklistPage } from '$lib/state/blocklist-page.svelte.ts';
  import { formatNumber, plural } from '$lib/util';

  interface Props {
    page: BlocklistPage;
    canSave: boolean;
    canDeploy: boolean;
  }

  let { page, canSave, canDeploy }: Props = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  let importMode = $state<'replace' | 'merge'>('replace');

  function startImport(mode: 'replace' | 'merge') {
    importMode = mode;
    fileInput?.click();
  }

  function onImportFile(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void page.importFile(file, importMode);
  }
</script>

<header class="head">
  <div>
    <h1>Manage Sources, Homebrew, and Allowed Content</h1>
    <p class="meta">
      {formatNumber(page.entries.length)}
      {plural(page.entries.length, 'rule', 'rules')}
      {#if !page.fileExists && !page.loadingList}
        · <StatusText variant="warning"
          >no content-blocklist.json yet - Save creates it</StatusText
        >{/if}
      {#if page.dirty}
        · <StatusText variant="warning">unsaved changes</StatusText>{/if}
    </p>
  </div>
  <div class="actions">
    <input
      type="file"
      accept=".json,application/json"
      class="visually-hidden"
      bind:this={fileInput}
      onchange={onImportFile}
    />
    <Button disabled={page.busy} onclick={() => startImport('replace')}
      >Import blocklist</Button
    >
    <Button
      disabled={page.busy}
      onclick={() => startImport('merge')}
      title="Add rules from a file without dropping the current ones"
      >Import &amp; merge</Button
    >
    <Button
      disabled={page.busy || page.entries.length === 0}
      onclick={page.exportList}>Export</Button
    >
    <Button disabled={page.busy || !page.dirty} onclick={page.cancel}
      >Cancel</Button
    >
    <Button
      variant="primary"
      disabled={page.busy || !page.dirty || !canSave}
      title={canSave
        ? ''
        : 'The homebrew source is a URL - nothing to write to.'}
      onclick={page.save}>{page.busy ? 'Saving.' : 'Save'}</Button
    >
    <Button
      variant="outlined"
      disabled={page.busy || page.deploying || !page.fileExists || !canDeploy}
      title={!canDeploy
        ? 'No deploy destinations configured - set Foundry or Deployed homebrew in Settings.'
        : !page.fileExists
          ? 'Nothing to deploy yet - Save creates content-blocklist.json first.'
          : "Copy the saved content-blocklist.json into the configured Foundry and/or Deployed homebrew folders, overwriting, and set Neptunium's World Content Blocklist in every connected Foundry world"}
      onclick={page.deploy}>{page.deploying ? 'Deploying.' : 'Deploy'}</Button
    >
  </div>
</header>

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .head h1 {
    margin: 0 0 0.25rem;
    font-size: var(--text-2xl);
  }
  .meta {
    margin: 0 0 0.875rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    align-items: center;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
