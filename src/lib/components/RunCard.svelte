<!--
  RunCard - the Deploy Site run in progress, pinned to the bottom of the
  sidebar so it shows from any view. While it runs: what it's doing, which
  numbered step it's on, and its latest log line. When it ends the card stays, with the outcome, until
  dismissed. It links back to Deploy Site, where the full log is.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import { runningStep } from '$lib/services/deploy-progress';
  import { deployRun, dismissOutcome } from '$lib/state/deploy-run.svelte.ts';

  const GLYPHS = {
    ok: 'fa-circle-check',
    warn: 'fa-triangle-exclamation',
    error: 'fa-circle-exclamation',
  } as const;
  const TITLES = { ok: 'Complete', warn: 'Done, with warnings', error: 'Failed' };

  const active = $derived(!!deployRun.busy);
  const outcome = $derived(deployRun.outcome);
  const title = $derived(
    active
      ? `${deployRun.busy}…`
      : outcome
        ? `${outcome.label}: ${TITLES[outcome.tone]}`
        : '',
  );
  // Numbered like the Deploy page's lists. Publish first: after a prepare-and-
  // publish the prepare list is still there, finished.
  const step = $derived(
    (deployRun.publishProgress && runningStep(deployRun.publishProgress)) ??
      (deployRun.prepareProgress && runningStep(deployRun.prepareProgress)),
  );
  const detail = $derived(
    active
      ? [
          step && `Step ${step.number} of ${step.total}`,
          deployRun.logs.at(-1)?.message,
        ]
          .filter(Boolean)
          .join(': ')
      : (outcome?.text ?? ''),
  );
</script>

{#if active || outcome}
  <div class="run-card" role="status" aria-live="polite">
    <div class="run-card-head">
      <a class="run-card-link" href="/deploy" title={title}>
        {#if active}
          <i
            class="run-card-glyph fa-sharp-duotone fa-regular fa-spinner-third fa-spin"
            aria-hidden="true"
          ></i>
        {:else if outcome}
          <i
            class="run-card-glyph run-card-glyph-{outcome.tone} fa-sharp-duotone fa-regular {GLYPHS[
              outcome.tone
            ]}"
            aria-hidden="true"
          ></i>
        {/if}
        <span class="run-card-body run-card-title">{title}</span>
      </a>
      {#if !active}
        <span class="run-card-body run-card-action">
          <Button variant="text" size="small" onclick={dismissOutcome}>
            Dismiss
          </Button>
        </span>
      {/if}
    </div>
    {#if detail}
      <p class="run-card-body run-card-detail" title={detail}>{detail}</p>
    {/if}
  </div>
{/if}

<style>
  /* ── Run Card - Layout ──────────────────────────────────────────────────── */
  .run-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    font-size: var(--text-sm);
  }

  .run-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .run-card-link {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    color: var(--text-main);
  }

  .run-card-body {
    min-inline-size: 0;
  }

  /* The text button's own padding would push it in from the card's edge. */
  .run-card-action {
    margin-block: calc(-1 * var(--space-1));
    margin-inline-end: calc(-1 * var(--space-2));
  }

  /* ── Run Card - Text ────────────────────────────────────────────────────── */
  .run-card-title {
    overflow: hidden;
    font-weight: var(--font-weight-semibold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .run-card-detail {
    margin: 0;
    overflow: hidden;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Run Card - Glyph ───────────────────────────────────────────────────── */
  .run-card-glyph {
    flex-shrink: 0;
    color: var(--gold);
  }

  .run-card-glyph-ok {
    color: var(--ok);
  }

  .run-card-glyph-warn {
    color: var(--warn);
  }

  .run-card-glyph-error {
    color: var(--danger);
  }

  /* ── Run Card - Collapsed Rail ──────────────────────────────────────────── */
  /* The icon rail has room for the glyph only; it still links to Deploy Site. */
  @media (min-width: 721px) {
    :global(html.sidebar-collapsed) .run-card {
      align-items: center;
      padding: var(--space-2);
      border-color: transparent;
      background: transparent;
    }

    :global(html.sidebar-collapsed) .run-card-body {
      display: none;
    }
  }
</style>
