<!--
  RunLog - the Deploy view's Output panel: the live log of the current (or
  last) pipeline run, fed by the "pipeline-event" stream through deploy-run.
  Keeps the newest line in view while a run streams in.
-->
<script lang="ts">
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import type { DeployPage } from '$lib/state/deploy-page.svelte';

  let { page }: { page: DeployPage } = $props();

  // Keep the newest log line in view while a run streams in.
  $effect(() => {
    if (page.logs.length && page.logEl)
      page.logEl.scrollTop = page.logEl.scrollHeight;
  });
</script>

<Panel>
  <PanelHead>
    <h2>Output</h2>
  </PanelHead>
  <div class="log-console" bind:this={page.logEl} role="log" aria-live="polite">
    {#if !page.logs.length}
      <span class="log-empty">Run output shows up here.</span>
    {/if}
    {#each page.logs as line, i (i)}
      <div class="log-line log-{line.level}">
        {#if line.level === 'step'}▸{/if}
        {line.message}
      </div>
    {/each}
  </div>
</Panel>

<style>
  /* ── Output - Log Console ───────────────────────────────────────────────── */
  .log-console {
    block-size: 18rem;
    padding: var(--space-3);
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-app);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: var(--line-height-normal);
  }

  .log-empty {
    color: var(--text-faint);
  }

  .log-line {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--text-muted);
  }

  .log-step {
    margin-block-start: var(--space-2);
    color: var(--gold-bright);
    font-weight: var(--font-weight-semibold);
  }

  .log-warn {
    color: var(--warn);
  }

  .log-error {
    color: var(--danger);
  }

  .log-done {
    color: var(--ok);
  }
</style>
