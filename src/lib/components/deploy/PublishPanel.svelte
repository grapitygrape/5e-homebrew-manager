<!--
  PublishPanel - Deploy step 3: where the site goes (the deploy folders, then
  the user's deploy scripts), the two-click Publish button, and when it last
  went out. Shared deploy styles (.deploy-lede, .deploy-steps, .not-set,
  .action-row, .last-run) come from routes/deploy/+page.svelte.
-->
<script lang="ts">
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { DeployProgress } from '$lib/services/deploy-progress';
  import { dateOf, type DeployPage } from '$lib/state/deploy-page.svelte';
  import StepStatus, { STEP_LABELS } from './StepStatus.svelte';

  let { page }: { page: DeployPage } = $props();

  const titles = (list: { title: string }[]) =>
    list.map((s) => s.title).join(', ');
</script>

{#snippet stepStatus(progress: DeployProgress | null, id: string)}
  {#if progress}
    {@const state = progress.steps[id] ?? 'pending'}
    <StepStatus {state} label={STEP_LABELS[state]} />
  {/if}
{/snippet}

<Panel>
  <PanelHead>
    <h2>3. Publish</h2>
  </PanelHead>
  {#if page.canPublish}
    <p class="deploy-lede">Publishes the site as it is in the 5e checkout:</p>
    <ol class="deploy-steps">
      <li>
        {@render stepStatus(page.publishProgress, 'copy')}
        {#if page.overview?.siteDeployFolders.length}
          Copies the site to {page.deployFolders}, leaving the image folders as
          they are.
        {:else}
          Copying is skipped: no deploy folders are set yet. Add one under
          <a href="/settings">Settings → Deploy site to</a>.
        {/if}
      </li>
      {#if page.enabledScripts.length}
        <li>
          {@render stepStatus(page.publishProgress, 'scripts')}
          Runs your deploy scripts: {titles(page.enabledScripts)}. They're told
          every file that changed since the last publish.
        </li>
      {/if}
    </ol>
  {:else}
    <p class="not-set">
      There's nowhere to publish to yet. Add a folder under
      <a href="/settings">Settings → Deploy site to</a>, or add a deploy script
      below.
    </p>
  {/if}
  <div class="action-row">
    <Button
      variant={page.armed === 'publish' ? 'primary' : 'outlined'}
      disabled={!!page.busy || !page.canPublish}
      onclick={page.publish}
    >
      {page.armed === 'publish'
        ? 'Click again to publish'
        : page.holdingBack.length
          ? 'Publish anyway'
          : 'Publish'}
    </Button>
    <span class="last-run">
      {#if page.lastRun}
        Last published: {dateOf(page.lastRun.at)}{page.lastRun.siteVersion
          ? ` · 5etools v${page.lastRun.siteVersion}`
          : ''}
      {:else}
        Not published yet
      {/if}
    </span>
  </div>
</Panel>
