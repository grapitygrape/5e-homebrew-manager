<!--
  UpstreamCheckCard — Summary card in `/sources` reporting whether an upstream
  5etools release is available and whether deploy-module patches, diffs, and
  script symbols still apply cleanly against it.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import type { UpstreamCheckReport, UpstreamRepoDelta } from '$lib/api';
  import { formatGitDateTime } from '$lib/state/sources-page.svelte.ts';
  import { plural } from '$lib/util';

  interface Props {
    report: UpstreamCheckReport;
    busy: boolean;
    onRecheck: () => void;
    onDismiss: () => void;
  }

  let { report, busy, onRecheck, onDismiss }: Props = $props();

  const blockingIssues = $derived(report.issues.filter((i) => i.enabled));
  const inactiveIssues = $derived(report.issues.filter((i) => !i.enabled));

  function deltaText(delta: UpstreamRepoDelta): string {
    const cur = delta.currentVersion ? `v${delta.currentVersion}` : 'HEAD';
    const next = delta.targetVersion
      ? `v${delta.targetVersion}`
      : (delta.targetDescribe ?? delta.targetRef);
    if (delta.behindCommits === 0) {
      return `${cur} — up to date with ${delta.targetRef}.`;
    }
    return `${cur} → ${next} (${delta.behindCommits} ${plural(delta.behindCommits, 'commit', 'commits')} behind ${delta.targetRef}).`;
  }
</script>

<Panel>
  <PanelHead>
    <div>
      <h2>Upstream readiness</h2>
      {#if report.checkedAt}
        <p class="upstream-meta">
          Checked {formatGitDateTime(report.checkedAt)} · {report.patchesChecked}
          {plural(report.patchesChecked, 'patch', 'patches')}, {report.diffsChecked}
          {plural(report.diffsChecked, 'diff', 'diffs')}
        </p>
      {/if}
    </div>
    <div class="upstream-actions">
      <Button variant="outlined" disabled={busy} onclick={onRecheck}>
        Re-check
      </Button>
      <Button variant="text" disabled={busy} onclick={onDismiss}>
        Dismiss
      </Button>
    </div>
  </PanelHead>

  <div class="upstream-body">
    <div class="upstream-summary">
      <i
        class={[
          'upstream-glyph fa-sharp-duotone fa-regular',
          report.ready
            ? 'fa-circle-check upstream-ok'
            : 'fa-triangle-exclamation upstream-warn',
        ]}
        aria-hidden="true"
      ></i>
      <div>
        <strong class="upstream-headline">
          {#if report.upToDate && report.ready}
            Up to date and all active modules apply cleanly
          {:else if report.ready}
            Upstream update available — all active modules apply cleanly
          {:else}
            {blockingIssues.length}
            {plural(blockingIssues.length, 'issue needs', 'issues need')} attention
            before updating
          {/if}
        </strong>
        <ul class="upstream-deltas">
          <li><strong>5etools:</strong> {deltaText(report.site)}</li>
          {#if report.utils}
            <li>
              <strong>5etools-utils:</strong>
              {deltaText(report.utils)}
              {#if report.wantedUtils}
                <span class="upstream-wanted">
                  (5e asks for v{report.wantedUtils})
                </span>
              {/if}
            </li>
          {/if}
        </ul>
      </div>
    </div>

    {#if report.warnings.length > 0}
      <ul class="upstream-list upstream-warnings">
        {#each report.warnings as warning (warning)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}

    {#if blockingIssues.length > 0}
      <ul class="upstream-list upstream-issues">
        {#each blockingIssues as issue (`${issue.category}:${issue.module}:${issue.message}`)}
          <li>
            <span class="upstream-badge">{issue.category}</span>
            <strong>{issue.module}</strong> — {issue.message}
          </li>
        {/each}
      </ul>
    {/if}

    {#if inactiveIssues.length > 0}
      <p class="upstream-inactive-note">
        {inactiveIssues.length} additional
        {plural(inactiveIssues.length, 'notice', 'notices')} on disabled or replaced
        modules.
      </p>
    {/if}

    <p class="upstream-cli-hint">
      For full guide schema coverage, enum drift, and customizer rebase checks,
      run <code>npm run upstream:check</code>.
    </p>
  </div>
</Panel>

<style>
  .upstream-meta {
    margin: var(--hm-space-0-5) 0 0;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  .upstream-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .upstream-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .upstream-summary {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
  }

  .upstream-glyph {
    color: var(--text-faint);
  }

  .upstream-ok {
    color: var(--ok);
  }

  .upstream-warn {
    color: var(--warn);
  }

  .upstream-headline {
    font-weight: var(--font-weight-semibold);
  }

  .upstream-deltas {
    margin: var(--space-1) 0 0;
    padding-inline-start: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    list-style: none;
  }

  .upstream-wanted {
    color: var(--text-faint);
  }

  .upstream-list {
    margin: 0;
    padding-inline-start: var(--space-5);
    font-size: var(--text-sm);
  }

  .upstream-issues {
    color: var(--warn);
  }

  .upstream-warnings {
    color: var(--text-muted);
  }

  .upstream-badge {
    display: inline-block;
    margin-inline-end: var(--space-1);
    padding: 0 var(--space-1);
    border: 1px solid currentcolor;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  .upstream-inactive-note,
  .upstream-cli-hint {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--text-xs);
  }
</style>
