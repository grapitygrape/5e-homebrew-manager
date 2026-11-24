<!--
  ReplacementHeader — title, mapping counts, bulk actions, warning filter link,
  and connected Foundry enforcement status for `/replacement`.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import { enforcementStatus } from '$lib/engine/foundry/replacements.ts';
  import { foundry } from '$lib/state/foundry.svelte.ts';
  import { doc, suggestions } from '$lib/state/supersessions.svelte.ts';
  import {
    WARNINGS_FILTER,
    type ReplacementPage,
  } from '$lib/state/replacement-page.svelte.ts';
  import { formatNumber, plural } from '$lib/util';

  interface Props {
    page: ReplacementPage;
    authoringPath: string;
    deployPath: string | null;
    canDeploy: boolean;
  }

  let { page, authoringPath, deployPath, canDeploy }: Props = $props();
</script>

<header class="head">
  <div class="row">
    <div class="head-text">
      <h1>Content Replacements</h1>
      <p class="meta">
        {formatNumber(doc.rows.length)}
        {plural(doc.rows.length, 'individual item', 'individual items')}
        {#if doc.overrides.length}&middot; {formatNumber(doc.overrides.length)}
          {plural(doc.overrides.length, 'source override', 'source overrides')} ({formatNumber(
            page.overrideRowCount,
          )}
          {plural(page.overrideRowCount, 'item', 'items')}){/if}
      </p>
    </div>
    <div class="actions">
      <Button
        disabled={page.scanning}
        title="Scan sources for &quot;Replaces:&quot; markers, and list what isn't mapped yet"
        onclick={page.rescan}>{page.scanning ? 'Scanning.' : 'Rescan'}</Button
      >
      <Button
        title="Look through a connected Foundry world for content these mappings replace"
        onclick={() => (page.scanningFoundry = true)}>Scan Foundry</Button
      >
      {#if suggestions.duplicates}
        <Button
          title="Homebrew that shares a name with official content and isn't mapped yet"
          onclick={() => (page.viewingDuplicates = true)}
          >Duplicates ({formatNumber(page.pendingDuplicates.length)})</Button
        >
      {/if}
      {#if page.visibleSuggestions.length}
        <Button
          title="Stage every suggestion below. Nothing is written until you Save."
          onclick={page.addAllSuggestions}
          >Add all {page.visibleSuggestions.length}</Button
        >
      {/if}
      <Button disabled={page.busy || !doc.dirty} onclick={page.cancel}
        >Cancel</Button
      >
      <Button
        variant="primary"
        disabled={page.busy || !doc.dirty}
        title={`Writes ${authoringPath}`}
        onclick={page.save}>{page.busy ? 'Saving.' : 'Save'}</Button
      >
      <Button
        variant="outlined"
        disabled={page.busy || page.deploying || !doc.fileExists || !canDeploy}
        title={!canDeploy
          ? 'The data source is a URL - there is no local data root to deploy into.'
          : !doc.fileExists
            ? 'Nothing to deploy yet - Save creates the file first.'
            : `Copies the saved file to ${deployPath}, where the site reads it`}
        onclick={page.deploy}>{page.deploying ? 'Deploying.' : 'Deploy'}</Button
      >
    </div>
  </div>
  <div class="row">
    <p class="meta">
      {#if page.warningCount}
        <button
          type="button"
          class="warnings-filter"
          title="Show only these in the table"
          onclick={() => (page.category = WARNINGS_FILTER)}
        >
          {#if doc.review.length}<StatusText variant="warning"
              >{formatNumber(doc.review.length)} to review</StatusText
            >{/if}
          {#if doc.review.length && page.deadRows}&middot;{/if}
          {#if page.deadRows}<StatusText
              variant="warning"
              title="content-blocklist.json hides one end of these, so the site has nothing to redirect from or to."
              >{formatNumber(page.deadRows)}
              {plural(page.deadRows, 'mapping points', 'mappings point')} at blocklisted
              content</StatusText
            >{/if}
        </button>
      {/if}
      {#if !doc.fileExists && !page.loading}&middot; <StatusText
          variant="warning"
          >no content-replacement.json yet - Save creates it</StatusText
        >{/if}
      {#if doc.dirty}&middot; <StatusText variant="warning"
          >unsaved changes</StatusText
        >{/if}
    </p>
    {#each foundry.status.clients as world (world.clientId)}
      {@const report = enforcementStatus(world)}
      <p class="meta">
        <StatusText variant={report.variant}>{report.text}</StatusText>
      </p>
    {/each}
  </div>
</header>

<style>
  .head {
    display: flex;
    flex-direction: column;
    margin-block-end: 0.875rem;
  }
  .head > .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  /* The text gives way, not the buttons: without this a long status line
     ("unsaved changes" appearing) pushes the whole button row underneath. */
  .head-text {
    flex: 1 1 20rem;
    min-width: 0;
    gap: 0;
  }
  .head .actions {
    flex-shrink: 0;
  }
  .head h1 {
    margin: 0 0 0.25rem;
    font-size: var(--text-2xl);
  }
  .meta {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    gap: 0.375rem;
    flex-wrap: wrap;
    align-items: center;
  }
  /* Reads as part of the status line; the underline says it's clickable. */
  .warnings-filter {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    &:where(:hover, :focus-visible) {
      text-decoration: underline;
    }
  }
</style>
