<!--
  StepStatus - the small glyph beside a Deploy step or Review check: waiting,
  a spinner while running, then done / warnings / failed. `info` is Review's
  "for information" state, in the same box.
-->
<script lang="ts" module>
  import type { StepState } from '$lib/services/deploy-progress';

  export const STEP_LABELS: Record<StepState, string> = {
    pending: 'Waiting',
    running: 'Running',
    done: 'Done',
    warn: 'Done, with warnings',
    failed: 'Failed',
  };
</script>

<script lang="ts">
  let { state, label }: { state: StepState | 'info'; label: string } = $props();
</script>

<span
  class="step-status {state === 'info'
    ? 'review-state-info'
    : `step-status-${state}`}"
  role="img"
  aria-label={label}
  title={label}
></span>

<style>
  /* ── Deploy - Step Progress ─────────────────────────────────────────────── */
  .step-status {
    --step-status-color: var(--text-faint);

    display: inline-grid;
    place-items: center;
    box-sizing: border-box;
    inline-size: 1rem;
    block-size: 1rem;
    margin-inline-end: var(--space-1);
    vertical-align: text-bottom;
    color: var(--step-status-color);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
  }

  .step-status-pending::before {
    content: '○';
  }

  .step-status-running {
    --step-status-color: var(--gold-bright);

    border: 2px solid var(--border);
    border-block-start-color: var(--step-status-color);
    border-radius: 50%;
    animation: step-status-spin 0.8s linear infinite;
  }

  .step-status-done {
    --step-status-color: var(--ok);

    &::before {
      content: '✓';
    }
  }

  .step-status-warn {
    --step-status-color: var(--warn);

    &::before {
      content: '!';
    }
  }

  .step-status-failed {
    --step-status-color: var(--danger);

    &::before {
      content: '✕';
    }
  }

  @keyframes step-status-spin {
    to {
      rotate: 360deg;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-status-running {
      animation: none;
    }
  }

  /* ── Deploy - Review States ─────────────────────────────────────────────── */
  /* Shares the step glyph's box; the other states reuse step-status-*. */
  .review-state-info {
    --step-status-color: var(--text-faint);

    &::before {
      content: 'i';
    }
  }
</style>
