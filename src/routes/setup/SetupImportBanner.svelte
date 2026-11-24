<!--
  SetupImportBanner — portable-mode offer to import the installed app's setup,
  plus the confirmation/warning list after import completes.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import type { SetupPage } from '$lib/state/setup-page.svelte.ts';

  interface Props {
    page: SetupPage;
  }

  let { page }: Props = $props();
</script>

{#if page.installed && page.importOpen}
  <section class="setup-import" aria-labelledby="setup-import-title">
    <h2 id="setup-import-title">Import the installed app's setup?</h2>
    <p>
      This portable copy starts with empty settings. This machine also has the
      installed app (<code>{page.installed}</code>). Importing copies its
      settings, fonts, scripts and content here. It replaces this copy's
      settings; files already in its data folder stay.
    </p>
    <div class="setup-actions">
      <Button
        variant="primary"
        disabled={page.importing}
        onclick={page.importInstalled}
      >
        {page.importing ? 'Importing…' : 'Import installed setup'}
      </Button>
      <Button
        variant="text"
        disabled={page.importing}
        onclick={() => (page.importOpen = false)}
      >
        Start fresh
      </Button>
    </div>
    {#if page.importError}
      <StatusText as="p" class="setup-note" variant="error"
        >{page.importError}</StatusText
      >
    {/if}
  </section>
{/if}

{#if page.imported}
  <div class="setup-imported">
    <StatusText as="p" variant="ok"
      >Imported. Check each step, then press Finish.</StatusText
    >
    {#each page.imported as problem (problem)}
      <StatusText as="p" class="setup-note" variant="warning"
        >{problem}</StatusText
      >
    {/each}
  </div>
{/if}

<style>
  .setup-import {
    margin-block-end: var(--space-5);
    padding: var(--space-4);
    border: 1px solid var(--gold);
    border-radius: var(--radius-sm);

    & h2 {
      margin-block: 0 var(--space-2);
      font-size: var(--text-base);
    }

    & p {
      margin-block: 0 var(--hm-space-2-5);
      color: var(--text-muted);
      font-size: var(--text-sm);
    }

    & code {
      font-size: var(--text-xs);
    }
  }

  .setup-imported {
    margin-block-end: var(--space-4);
  }
</style>
