<!--
  Source Data — manages the git checkouts behind the site, brew schemas, and
  homebrew. State and backend actions live in `state/sources-page.svelte.ts`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { SourcesPage } from '$lib/state/sources-page.svelte.ts';
  import SchemaSyncBanner from './SchemaSyncBanner.svelte';
  import UpstreamCheckCard from './UpstreamCheckCard.svelte';
  import RepoCard from './RepoCard.svelte';

  const page = new SourcesPage();

  onMount(() => page.mount());
</script>

<View width="wide">
  <ViewHeader>
    <h1>Source Data</h1>
    <p>
      The git checkouts the site, brew schemas and homebrew come from. Lock them
      to a known-good version so an update can't move them.
    </p>
  </ViewHeader>

  {#if !page.desktop}
    <EmptyState>
      This view drives git through the desktop app. Open it with
      <code>npm run tauri:dev</code>.
    </EmptyState>
  {:else if page.loadError}
    <EmptyState variant="error">
      Couldn't read the repositories: {page.loadError}
    </EmptyState>
  {:else if !page.overview}
    <EmptyState>Reading repositories…</EmptyState>
  {:else}
    {#if page.banner}
      <Banner
        tone={page.banner.tone}
        text={page.banner.text}
        ondismiss={() => (page.banner = null)}
      />
    {/if}

    <div class="action-row repo-actions">
      <Button
        variant="outlined"
        disabled={!!page.busy}
        onclick={page.fetchAll}
      >
        Fetch all
      </Button>
      <Button
        variant="outlined"
        disabled={!!page.busy}
        onclick={() => page.checkUpstream(true)}
      >
        Check for upstream updates
      </Button>
      <Button disabled={!!page.busy} onclick={page.lockAll}>
        Lock all at current
      </Button>
      {#if page.anyLocked}
        <Button variant="text" disabled={!!page.busy} onclick={page.unlockAll}>
          Unlock all
        </Button>
      {/if}
      {#if page.busy}
        <span class="busy-note">{page.busy}…</span>
      {:else if page.refreshing}
        <span class="busy-note">Re-reading repositories…</span>
      {/if}
    </div>

    {#if page.schema}
      <SchemaSyncBanner
        schema={page.schema}
        site={page.site}
        homebrewAnchored={page.homebrewAnchored}
        busy={!!page.busy}
        onSyncUtils={page.syncUtils}
        onSyncHomebrew={page.syncHomebrew}
      />
    {/if}

    {#if page.upstream}
      <UpstreamCheckCard
        report={page.upstream}
        busy={!!page.busy}
        onRecheck={() => page.checkUpstream(true)}
        onDismiss={page.dismissUpstream}
      />
    {/if}

    <div class="repo-list">
      {#each page.overview.repos as repo (repo.id)}
        <RepoCard {repo} {page} />
      {/each}
    </div>
  {/if}
</View>

<style>
  .action-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .repo-actions {
    margin-block-end: var(--space-6);
  }

  .busy-note {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  .repo-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .repo-list :global(.repo-card) {
    gap: var(--space-4);
  }

  /* The card's gap spaces it; the banner's own margin would double that. */
  .repo-list :global(.repo-card .repo-drift) {
    margin-block-end: 0;
  }
</style>
