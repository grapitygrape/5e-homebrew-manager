<!--
  Header shared by the two Homebrew Files screens: title on the left, and on
  the right the switch between Add a homebrew file and Manage files plus
  Deploy, which copies every brew in the working folder to Settings' homebrew
  deploy folders (the per-row Deploy, for all of them at once).
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Link from '$lib/ui/Link.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import { deployAllHomebrew } from '$lib/api';
  import {
    errorText,
    formatFolderOutcome,
    plural,
    type FolderOutcome,
  } from '$lib/util';

  let {
    title,
    description,
    current,
    canDeploy = true,
  }: {
    title: string;
    description: string;
    current: 'add' | 'manage';
    canDeploy?: boolean;
  } = $props();

  let deploying = $state(false);
  let note = $state<FolderOutcome | null>(null);

  async function deployAll() {
    deploying = true;
    note = null;
    try {
      const { files, copied, errors } = await deployAllHomebrew();
      note = formatFolderOutcome(
        `Copied ${files} ${plural(files, 'file')} to`,
        copied.length,
        errors,
        'Deploy failed',
      );
    } catch (e) {
      note = { ok: false, text: errorText(e) };
    } finally {
      deploying = false;
    }
  }
</script>

<ViewHeader class="files-header">
  <div class="files-header-text">
    <h1>{title}</h1>
    <p>{description}</p>
  </div>
  <div class="files-header-actions">
    {#if current !== 'add'}
      <Link href="/files/add" variant="primary"
        >Add a new Homebrew Source</Link
      >
    {/if}
    <Link
      href="/files"
      variant={current === 'manage' ? 'secondary' : 'text'}
      aria-current={current === 'manage' ? 'page' : undefined}
      >Manage files</Link
    >
    <Button
      variant="outlined"
      onclick={deployAll}
      disabled={!canDeploy || deploying}
      title={canDeploy
        ? 'Copy every file in your homebrew folder into the configured Foundry and/or Deployed homebrew folders, overwriting'
        : 'Set a Foundry or Deployed homebrew folder in Settings first'}
    >
      {deploying ? 'Deploying…' : 'Deploy'}
    </Button>
  </div>
</ViewHeader>

{#if note}
  <StatusText
    as="div"
    class="files-deploy-note"
    variant={note.ok ? 'ok' : 'error'}>{note.text}</StatusText
  >
{/if}

<style>
  /* ── Files Header ───────────────────────────────────────────────────────── */
  :global(.files-header) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .files-header-text {
    min-inline-size: 0;
  }

  .files-header-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--hm-space-1-5);
    flex-shrink: 0;
  }

  :global(.files-deploy-note) {
    margin-block: calc(-1 * var(--space-3)) var(--space-3);
    font-size: var(--text-sm);
  }
</style>
