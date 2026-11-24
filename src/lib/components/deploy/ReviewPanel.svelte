<!--
  ReviewPanel - Deploy step 2: one checklist over the prepared candidate
  (release-checks.ts), each line linking to where it gets fixed, plus the
  preview button, Check again, and the rollback to the live version.
  Shared deploy styles (.deploy-lede, .not-set, .action-row) come from
  routes/deploy/+page.svelte.
-->
<script lang="ts">
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { StepState } from '$lib/services/deploy-progress';
  import type { CheckState } from '$lib/services/release-checks';
  import { openExternalTarget } from '$lib/tauri-bridge';
  import type { DeployPage } from '$lib/state/deploy-page.svelte';
  import StepStatus from './StepStatus.svelte';

  let { page }: { page: DeployPage } = $props();

  // Review lines reuse the step glyphs.
  const CHECK_GLYPH: Record<CheckState, StepState | 'info'> = {
    ok: 'done',
    warn: 'warn',
    fail: 'failed',
    info: 'info',
  };
  const CHECK_LABELS: Record<CheckState, string> = {
    ok: 'OK',
    warn: 'Needs a look',
    fail: 'Problem',
    info: 'For information',
  };
</script>

<Panel>
  <PanelHead>
    <h2>2. Review</h2>
    {#if page.review?.prepare}
      {#if page.review.unpublished}
        <Badge variant="warning">Not published yet</Badge>
      {:else}
        <Badge variant="positive">Live</Badge>
      {/if}
    {/if}
  </PanelHead>
  {#if page.reviewError}
    <p class="not-set">Couldn't run the checks: {page.reviewError}</p>
  {:else if !page.review}
    <p class="not-set">Checking…</p>
  {:else if !page.review.prepare}
    <p class="not-set">
      Nothing prepared yet. The checks run once Prepare has built a version.
    </p>
  {:else}
    <p class="deploy-lede">
      {#if page.holdingBack.length}
        {page.holdingBack.length === 1
          ? 'One check'
          : `${page.holdingBack.length} checks`}
        could mean a broken site, so they hold back an automatic publish.
      {:else}
        Nothing here would break the published site.
      {/if}
      The rest is tidying for this app's guides and checks.
    </p>
    <ul class="review-list">
      {#each page.review.checks as check (check.id)}
        <li class="review-item">
          <StepStatus
            state={CHECK_GLYPH[check.state]}
            label={CHECK_LABELS[check.state]}
          />
          <div class="review-item-body">
            <strong>{check.title}</strong>
            <p>{check.text}</p>
            {#if check.details.length}
              <details class="review-item-details">
                <summary>
                  {check.details.length}
                  {check.details.length === 1 ? 'detail' : 'details'}
                </summary>
                <ul>
                  {#each check.details as detail, i (i)}
                    <li>{detail}</li>
                  {/each}
                </ul>
              </details>
            {/if}
          </div>
          <div class="action-row action-row-tight">
            {#if check.id === 'guide-lists' && check.state === 'warn'}
              <Button
                size="small"
                disabled={!!page.busy}
                onclick={page.regenerateLists}
              >
                Regenerate
              </Button>
            {/if}
            {#if check.href && check.state !== 'ok'}
              <a class="review-item-link" href={check.href}>Open</a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    <div class="action-row">
      {#if page.previewUrl}
        <Button
          variant="outlined"
          onclick={() => page.previewUrl && openExternalTarget(page.previewUrl)}
        >
          Open the preview
        </Button>
      {/if}
      <Button
        variant="text"
        disabled={!!page.busy || page.reviewing}
        onclick={page.loadReview}
      >
        {page.reviewing ? 'Checking…' : 'Check again'}
      </Button>
      {#if page.canRollBack}
        <Button
          variant={page.armed === 'rollback' ? 'primary' : 'text'}
          disabled={!!page.busy}
          onclick={page.rollBack}
        >
          {page.armed === 'rollback'
            ? 'Click again to roll back'
            : 'Roll back to the live version'}
        </Button>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  /* ── Deploy - Review List ───────────────────────────────────────────────── */
  .review-list {
    display: grid;
    gap: var(--space-3);
    margin-block: 0 var(--space-5);
    padding: 0;
    list-style: none;
  }

  .review-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
    font-size: var(--text-sm);

    p {
      margin-block: var(--space-1) 0;
      color: var(--text-muted);
    }
  }

  .review-item-details {
    margin-block-start: var(--space-1);
    color: var(--text-muted);
    font-size: var(--text-xs);

    ul {
      margin-block: var(--space-1) 0;
      padding-inline-start: var(--space-5);
    }
  }

  .review-item-link {
    font-size: var(--text-sm);
  }
</style>
