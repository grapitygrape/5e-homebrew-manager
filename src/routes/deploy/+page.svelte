<!--
  Deploy Site - builds the next version of the site locally, checks it, then
  publishes it. The checkouts it builds from are pinned in Source Data, and
  the customizations it applies are switched on in Customize Site.

  SHAPE
    A. Update the site, in three stages:
       1. Prepare (PreparePanel): the repos at their set versions, the
          homebrew refreshed, the customizations applied, the service worker
          rebuilt. Nothing leaves this machine; the result is served on the
          local server.
       2. Review (ReviewPanel): one checklist over the candidate
          (release-checks.ts), with a link to where each thing gets fixed, a
          preview button, and a rollback to the live version.
       3. Publish (PublishPanel): the copy to the deploy folders, then the
          deploy scripts.
       "Prepare and publish if the checks pass" runs 1-3 and stops after 2
       when a check that could break the site isn't ok.
    B. Output (RunLog): the live log fed by the "pipeline-event" stream, shown
       once a run starts.
    C. Other deployment options (DeployScriptsPanel): dry run, customizations
       only, then the user's own deploy scripts and the form that adds them.
    D. Images: copied by hand, repo by repo. A deploy never touches them.

  BAKED IN vs LAYERED ON. Everything up to the copy to the deploy folders is
  the app's. Deploy scripts are the user's layer on top (e.g. a Cloudflare
  purge is one); they run after the copy, in order.

  TAURI ONLY. Everything here calls the Rust core, so a plain browser tab gets
  an empty state instead of a page full of failing buttons.

  ONE THING AT A TIME. A run touches the working trees, so a single `busy`
  flag disables every action while one runs. It, the log and the step ticks
  live in state/deploy-run, so a run carries on, and shows in the sidebar,
  while another view is open. The page's own state and actions are in
  state/deploy-page.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import RowCard from '$lib/ui/RowCard.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import { deployRun } from '$lib/state/deploy-run.svelte.ts';
  import { DeployPage } from '$lib/state/deploy-page.svelte';
  import PreparePanel from '$lib/components/deploy/PreparePanel.svelte';
  import RunLog from '$lib/components/deploy/RunLog.svelte';
  import ReviewPanel from '$lib/components/deploy/ReviewPanel.svelte';
  import PublishPanel from '$lib/components/deploy/PublishPanel.svelte';
  import DeployScriptsPanel from '$lib/components/deploy/DeployScriptsPanel.svelte';

  const page = new DeployPage();

  // A run started on an earlier visit to this page: reload once it ends.
  $effect(() => {
    page.syncFinishedRun(deployRun.finishedId);
  });

  onMount(() => page.open());
</script>

<View width="wide" class="deploy-view">
  <ViewHeader>
    <h1>Deploy Site</h1>
    <p>
      Build the next version of the site here, check it, then publish it. Set
      the versions it builds from in <a href="/sources">Source Data</a> and the
      changes it makes in <a href="/customize">Customize Site</a>.
    </p>
  </ViewHeader>

  {#if !page.desktop}
    <EmptyState>
      This view drives git and the deploy steps through the desktop app. Open it
      with <code>npm run tauri:dev</code>.
    </EmptyState>
  {:else if page.loadError}
    <EmptyState variant="error">
      Couldn't read the repositories: {page.loadError}
    </EmptyState>
  {:else if !page.overview}
    <EmptyState>Reading repositories…</EmptyState>
  {:else}
    {#if page.shownBanner}
      <Banner
        tone={page.shownBanner.tone}
        text={page.shownBanner.text}
        ondismiss={page.dismissBanner}
      />
    {/if}

    <PreparePanel {page} />

    {#if page.busy || page.logs.length}
      <RunLog {page} />
    {/if}

    <ReviewPanel {page} />

    <PublishPanel {page} />

    <DeployScriptsPanel {page} />

    <!-- D. Images -->
    <section class="deploy-options" aria-labelledby="deploy-images-title">
      <h2 id="deploy-images-title">Images</h2>
      <p class="deploy-lede">
        A deploy never touches these folders. Copying adds new and changed
        images to {page.deployFolders || 'the deploy folders'} and deletes nothing.
        It can take a long time.
      </p>
      {#each page.images as image (image.id)}
        <RowCard>
          <div class="option-text">
            <h3>
              {image.title}
              {#if !image.downloaded}<Badge>Not downloaded</Badge>{/if}
            </h3>
            <p>{image.path || 'No folder set'} → {image.folder}/</p>
          </div>
          <Button
            variant={page.armed === `images:${image.id}`
              ? 'primary'
              : 'outlined'}
            disabled={!!page.busy ||
              !image.downloaded ||
              !page.overview.siteDeployFolders.length}
            onclick={() =>
              page.confirmed(`images:${image.id}`) &&
              page.run(`images:${image.id}`, `Copy ${image.title}`)}
          >
            {page.armed === `images:${image.id}`
              ? 'Click again to copy'
              : 'Copy images'}
          </Button>
        </RowCard>
      {/each}
    </section>
  {/if}
</View>

<style>
  /* Shared by this page and its panels (lib/components/deploy/), so they are
     global under the page root; :where keeps the root out of the specificity. */

  /* ── Shared - Action Rows ───────────────────────────────────────────────── */
  :global(:where(.deploy-view) .action-row) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  :global(:where(.deploy-view) .action-row-tight) {
    gap: var(--space-1);
  }

  :global(:where(.deploy-view) .faint-note) {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  :global(:where(.deploy-view) .not-set) {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* ── Deploy - Full Update ───────────────────────────────────────────────── */
  :global(:where(.deploy-view) .deploy-lede) {
    margin-block: 0 var(--space-2);
    color: var(--text-muted);
  }

  :global(:where(.deploy-view) .deploy-steps) {
    display: grid;
    gap: var(--hm-space-1-5);
    margin-block: 0 var(--space-5);
    padding-inline-start: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--line-height-normal);
  }

  :global(:where(.deploy-view) .last-run) {
    margin-inline-start: auto;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* ── Deploy - Other Options ─────────────────────────────────────────────── */
  :global(:where(.deploy-view) .deploy-options) {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-end: var(--space-6);
  }

  :global(:where(.deploy-view) .deploy-options > h2) {
    margin-block: 0 var(--space-1);
  }

  :global(:where(.deploy-view) .option-text) {
    min-inline-size: 0;
  }

  :global(:where(.deploy-view) .option-text h3) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--hm-space-1-5);
    margin: 0;
    font-size: var(--text-base);
  }

  :global(:where(.deploy-view) .option-text p) {
    margin-block: var(--space-1) 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
