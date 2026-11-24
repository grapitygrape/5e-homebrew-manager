<!--
  PreparePanel - Deploy step 1: what Prepare does, in order, each step ticked
  as the run reaches it, and the Prepare buttons with when it last ran.
  Shared deploy styles (.deploy-lede, .deploy-steps, .action-row, .last-run,
  .faint-note) come from routes/deploy/+page.svelte.
-->
<script lang="ts">
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { DeployProgress } from '$lib/services/deploy-progress';
  import { dateOf, type DeployPage } from '$lib/state/deploy-page.svelte';
  import StepStatus, { STEP_LABELS } from './StepStatus.svelte';

  let { page }: { page: DeployPage } = $props();
</script>

{#snippet stepStatus(progress: DeployProgress | null, id: string)}
  {#if progress}
    {@const state = progress.steps[id] ?? 'pending'}
    <StepStatus {state} label={STEP_LABELS[state]} />
  {/if}
{/snippet}

<Panel>
  <PanelHead>
    <h2>1. Prepare</h2>
  </PanelHead>
  <p class="deploy-lede">
    Builds the next version in the 5e checkout. Nothing is published. In order,
    it:
  </p>
  <ol class="deploy-steps">
    <li>
      {@render stepStatus(page.prepareProgress, 'repos')}
      Updates each repo to the version set in Source Data.
      {#if page.lockedRepos.length}
        Locked repos stay put: {page.lockedRepos.join(', ')}. The rest pull the
        latest.
      {:else}
        Nothing is locked, so every repo pulls the latest.
      {/if}
      {#if page.homebrewAnchored}
        5e-homebrew goes to its last commit before the 5e it builds.
      {/if}
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'homebrew')}
      Refreshes your homebrew files from 5e-homebrew.
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'reset')}
      Resets the 5e checkout, throwing away any edits made there by hand, then updates
      it.
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'block')}
      Blocks any official book or partnered brew added since the last full update,
      so it stays hidden until you unblock it in
      <a href="/blocklist">Choose Content</a>.
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'index')}
      Rebuilds the homebrew index.
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'modules')}
      Applies the customizations switched on in
      <a href="/customize">Customize Site</a> ({page.enabledModules.length} of
      {page.modules.length}).
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'worker')}
      Rebuilds the service worker so browsers pick up the changes.
    </li>
    <li>
      {@render stepStatus(page.prepareProgress, 'preview')}
      Serves the result on the local server{page.previewUrl
        ? ` (${page.previewUrl})`
        : ''} to look over.
    </li>
  </ol>
  <div class="action-row">
    <Button
      variant="primary"
      disabled={!!page.busy}
      onclick={page.prepareAndPublish}
    >
      Prepare and publish if the checks pass
    </Button>
    <Button disabled={!!page.busy} onclick={page.prepare}>Prepare only</Button>
    {#if page.busy}
      <span class="faint-note">{page.busy}…</span>
    {/if}
    <span class="last-run">
      {#if page.review?.prepare}
        Last prepared: {dateOf(page.review.prepare.at)}{page.review.prepare
          .siteVersion
          ? ` · 5etools v${page.review.prepare.siteVersion}`
          : ''}
      {:else}
        Not prepared yet
      {/if}
    </span>
  </div>
</Panel>
