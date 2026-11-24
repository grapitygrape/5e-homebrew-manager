<!--
  Overview — the first page of Conversion Guides: workspace status + the
  guide-coverage audit. Links and data sources live on the Dashboard. The view
  comes from dashboard-service via +page.ts; "Run Audit" recomputes it through lib/api.
  Audit rows open their guide through `onselect`.
-->
<script lang="ts">
  import { aggregateAudit } from '$lib/engine/audit';
  import { formatNumber, guideTitle } from '$lib/util';
  import Badge from '$lib/ui/Badge.svelte';
  import CardGrid from '$lib/ui/CardGrid.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import PanelHead from '$lib/ui/PanelHead.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Bar from '$lib/ui/Bar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Card from '$lib/ui/Card.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import { runGuideAudit, type DashboardView } from '$lib/api';
  import { isTauri } from '$lib/tauri-bridge';

  let {
    data,
    onselect,
  }: { data: DashboardView; onselect: (file: string) => void } = $props();

  // `refreshed` holds a re-run audit; `auditData` falls back to the loaded one
  // and stays reactive to `data` (avoids capturing only its initial value).
  let refreshed = $state<typeof data.audit>(null);
  let running = $state(false);
  const auditData = $derived(refreshed ?? data.audit);

  const agg = $derived(auditData ? aggregateAudit(auditData.summary) : null);
  const rows = $derived(
    [...(auditData?.summary ?? [])].sort((a, b) => a.coverage - b.coverage),
  );

  const homebrewEntityCount = $derived(
    data.homebrew.files.reduce(
      (sum: number, f: { counts: Record<string, number> }) =>
        sum +
        Object.values(f.counts).reduce((a: number, b: number) => a + b, 0),
      0,
    ),
  );
  const configured = $derived(data.guides.length > 0 || data.homebrew.exists);
  const coverageVariant = (c: number): 'positive' | 'warning' | 'danger' =>
    c >= 75 ? 'positive' : c >= 40 ? 'warning' : 'danger';

  async function runAuditNow() {
    running = true;
    try {
      refreshed = await runGuideAudit(true);
    } catch {
      // Keep showing the last report, as a failed request did before.
    } finally {
      running = false;
    }
  }
</script>

<div class="overview">
  {#if !data.setupCompleted && !isTauri()}
    <Banner
      tone="warn"
      text="Setup isn't finished. Open the desktop app to choose the repos and where they go."
    />
  {:else if data.missingRepos.length}
    <Banner
      tone="warn"
      text="Not downloaded yet: {data.missingRepos.join(
        ', ',
      )}. Run setup again from Settings to fetch them."
    />
  {/if}
  <CardGrid spacing="outer">
    <Card
      label="Conversion Guides"
      value={formatNumber(data.guides.length)}
      sub="markdown guides found"
    />
    <Card
      label="Homebrew Files"
      value={formatNumber(data.homebrew.files.length)}
      sub={data.homebrew.exists ? 'in configured folder' : 'folder not found'}
    />
    <Card
      label="Homebrew Entities"
      value={formatNumber(homebrewEntityCount)}
      sub="across all files"
    />
  </CardGrid>

  <!-- Audit -->
  <Panel>
    <PanelHead>
      <h2>Guide coverage audit</h2>
      <Button variant="primary" onclick={runAuditNow} disabled={running}
        >{running ? 'Running…' : 'Run Audit'}</Button
      >
    </PanelHead>

    {#if agg && rows.length}
      <CardGrid spacing="inner">
        <Card
          label="Overall coverage"
          value={`${agg.coverage}%`}
          variant="elevated"
        >
          <Bar value={agg.coverage} variant={coverageVariant(agg.coverage)} />
        </Card>
        <Card
          label="Undocumented"
          value={formatNumber(agg.missing)}
          sub="schema fields missing from guides"
          variant="elevated"
        />
        <Card
          label="Outdated / mismatched"
          value={formatNumber(agg.extra)}
          sub="guide-only / renamed fields"
          variant="elevated"
        />
      </CardGrid>

      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Guide</th><th>Coverage</th><th>Documented</th><th>Missing</th
              ><th>Mismatched</th></tr
            ></thead
          >
          <tbody>
            {#each rows as r (r.guide)}
              <tr>
                <td
                  ><button
                    type="button"
                    class="guide-link"
                    onclick={() => onselect(r.guide)}
                    >{guideTitle(r.guide)}</button
                  ></td
                >
                <td
                  ><Badge variant={coverageVariant(r.coverage)}
                    >{r.coverage}%</Badge
                  ></td
                >
                <td>{r.total - r.missing}/{r.total}</td>
                <td
                  >{#if r.missing}<Badge variant="danger">{r.missing}</Badge
                    >{:else}0{/if}</td
                >
                <td
                  >{#if r.extra}<Badge variant="warning">{r.extra}</Badge
                    >{:else}0{/if}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <EmptyState>
        No audit data. This needs both a <strong>schema</strong> source and a
        <strong>guides</strong>
        folder configured (see Settings). Then click <em>Run Audit</em>.
      </EmptyState>
    {/if}
  </Panel>

  {#if !configured}
    <div class="stub-note">
      No data found at the configured paths yet. Point the sources at your
      source-data checkout (Settings) and the numbers above fill in. Nothing is
      bundled — bring your own data.
    </div>
  {/if}
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm);
  }
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border);
  }
  th {
    color: var(--text-muted);
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  /* Opens the guide in place, so it's a button styled like the app's links. */
  .guide-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--gold-bright);
    font: inherit;
    cursor: pointer;
  }
  .guide-link:hover {
    color: var(--gold);
  }
</style>
