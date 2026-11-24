<!--
  SetupDownloadStep — Step 3: git detection, ZIP fallback when git is missing,
  per-repo sync progress rows, and the Download / update all trigger.
-->
<script lang="ts">
  import Badge from '$lib/ui/Badge.svelte';
  import Bar from '$lib/ui/Bar.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import { openExternalTarget, type SetupDraft } from '$lib/api';
  import { zipUrl, type SetupPage } from '$lib/state/setup-page.svelte.ts';

  interface Props {
    page: SetupPage;
    draft: SetupDraft;
  }

  let { page, draft }: Props = $props();
</script>

{#if page.git === undefined}
  <p class="setup-intro">Looking for git…</p>
{:else if page.git}
  <Badge variant="positive" class="setup-git-badge">Git {page.git}</Badge>
  <p class="setup-intro">
    Empty folders get the latest version only; existing checkouts are updated.
  </p>
{:else}
  <div class="setup-no-git">
    <p>
      <strong>Git needs to be installed on your machine.</strong>
      <a href="https://git-scm.com/install/">Install it</a> and press Re-check, or
      download each repo as a ZIP, extract it, and pick that folder in the Folders
      step. Updating then means downloading again.
    </p>
    <div class="setup-actions">
      <Button
        size="small"
        onclick={() => openExternalTarget('https://git-scm.com/downloads')}
      >
        Get Git
      </Button>
      <Button size="small" variant="outlined" onclick={page.checkGit}
        >Re-check</Button
      >
    </div>
    <ul class="setup-zip-links">
      {#each page.activeRepos as r (r.id)}
        {#if draft.repos[r.id].url.trim()}
          <li>
            <Button
              size="small"
              variant="text"
              onclick={() => openExternalTarget(zipUrl(draft.repos[r.id].url))}
            >
              {r.label} ZIP
            </Button>
          </li>
        {/if}
      {/each}
    </ul>
  </div>
{/if}

<div class="setup-repo-rows">
  {#each page.activeRepos as r (r.id)}
    {@const run = page.runs[r.id]}
    <div class="setup-repo-row">
      <div class="setup-repo-head">
        <strong>{r.label}</strong>
        <code>{draft.repos[r.id].path || 'no folder set'}</code>
      </div>
      {#if run}
        {#if run.state === 'running'}
          <Bar value={run.percent ?? 0} />
        {/if}
        <StatusText
          as="p"
          class="setup-note"
          variant={run.state === 'error'
            ? 'error'
            : run.state === 'done'
              ? 'ok'
              : 'default'}
        >
          {run.message}
        </StatusText>
      {:else}
        <p class="setup-note">{page.rowStatus(r.id)}</p>
      {/if}
    </div>
  {/each}
</div>

{#if page.git}
  <div class="setup-actions">
    <Button variant="primary" disabled={page.syncing} onclick={page.syncAll}>
      {page.syncing ? 'Working…' : 'Download / update all'}
    </Button>
  </div>
{/if}

<style>
  .setup-no-git {
    margin-block-end: var(--space-4);
    padding: var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);

    & p {
      margin-block: 0 var(--hm-space-2-5);
    }
  }

  .setup-zip-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-block: var(--hm-space-2-5) 0;
    padding: 0;
    list-style: none;
  }

  .setup-repo-rows {
    display: grid;
    gap: var(--hm-space-3-5);
    margin-block-end: var(--space-4);
  }

  .setup-repo-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--hm-space-2-5);

    & code {
      color: var(--text-faint);
      font-size: var(--text-xs);
    }
  }
</style>
