<!--
  RepoCard — one git repository status card in `/sources`, including drift
  warning + rollback, commit/remote/working-tree facts, ref switcher, and lock
  controls.
-->
<script lang="ts">
  import Badge from '$lib/ui/Badge.svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Card from '$lib/ui/Card.svelte';
  import SelectInput from '$lib/ui/SelectInput.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import type { RepoStatus } from '$lib/api';
  import {
    formatGitDateTime,
    formatGitDay,
    type SourcesPage,
  } from '$lib/state/sources-page.svelte.ts';
  import { plural } from '$lib/util';

  interface Props {
    repo: RepoStatus;
    page: SourcesPage;
  }

  let { repo, page }: Props = $props();
</script>

<Card class="repo-card">
  {#if repo.exists && repo.lock.locked && !repo.atPinnedCommit && repo.lock.pinnedCommit}
    <Banner
      tone="warn"
      class="repo-drift"
      text={repo.id === '5e'
        ? `Moved off its locked commit ${repo.lock.pinnedCommit} (now at ${repo.commit}). The next pipeline run moves it back.`
        : `Moved off its locked commit ${repo.lock.pinnedCommit} (now at ${repo.commit}). The pipeline won't move it back; it uses this checkout as it is.`}
    >
      <Button
        size="small"
        disabled={!!page.busy}
        onclick={() => page.rollBack(repo)}
      >
        Roll back to {repo.lock.pinnedCommit}
      </Button>
    </Banner>
  {/if}

  <div class="repo-card-head">
    <div>
      <h3>{repo.label}</h3>
      {#if repo.path}
        <code class="repo-path">{repo.path}</code>
      {/if}
    </div>
    {#if repo.lock.locked}
      <Badge
        variant={repo.atPinnedCommit ? 'positive' : 'warning'}
        title={repo.atPinnedCommit
          ? repo.lock.note
          : 'The checkout has moved off its locked commit.'}
      >
        Locked at {repo.lock.pinnedCommit ?? '?'}
      </Badge>
    {:else}
      <Badge>Unlocked</Badge>
    {/if}
  </div>

  {#if !repo.path}
    <p class="repo-missing">
      Not set. Choose its folder in <a href="/settings">Settings</a>.
    </p>
  {:else if !repo.exists}
    <p class="repo-missing">
      No git checkout in that folder. Download it from
      <a href="/setup">Setup</a>.
    </p>
  {:else}
    <dl class="repo-facts">
      <div class="repo-fact">
        <dt>Commit</dt>
        <dd class="repo-fact-value">{formatGitDay(repo.commitTimestamp)}</dd>
        <dd
          class="repo-fact-sub"
          title={formatGitDateTime(repo.commitTimestamp)}
        >
          {repo.commitSubject} · <code>{repo.commit}</code>
        </dd>
      </div>

      <div class="repo-fact">
        <dt>Your copy</dt>
        <dd class="repo-fact-value">
          {#if repo.behindCount}
            {repo.behindCount}
            {plural(repo.behindCount, 'commit', 'commits')} behind
          {:else}
            Up to date
          {/if}
        </dd>
        <dd class="repo-fact-sub">
          {repo.aheadCount
            ? `${repo.aheadCount} local ${plural(repo.aheadCount, 'commit', 'commits')} ahead`
            : 'As of the last fetch'}
        </dd>
      </div>

      <div class="repo-fact">
        <dt>Working tree</dt>
        <dd class="repo-fact-value">
          {#if repo.dirtyFiles.length}
            <Badge
              variant="warning"
              title={repo.dirtyFiles.slice(0, 20).join('\n')}
            >
              {repo.dirtyFiles.length} changed
            </Badge>
          {:else}
            Clean
          {/if}
        </dd>
      </div>
    </dl>

    <div class="repo-card-foot">
      <div class="ref-switcher">
        <SelectInput
          aria-label="Recent tags for {repo.label}"
          bind:value={page.tagChoice[repo.id]}
          disabled={!!page.busy || !repo.recentTags.length}
        >
          <option value="">
            {repo.recentTags.length ? 'Pick a tag…' : 'No tags'}
          </option>
          {#each repo.recentTags as tag (tag.name)}
            <option value={tag.name}>
              {tag.name} · {formatGitDay(tag.timestamp)}
            </option>
          {/each}
        </SelectInput>
        <TextInput
          aria-label="Custom ref for {repo.label}"
          placeholder="or branch / tag / commit"
          bind:value={page.customRef[repo.id]}
          disabled={!!page.busy}
        />
        <Button
          disabled={!!page.busy || !page.targetRefFor(repo)}
          onclick={() => page.checkout(repo)}
        >
          Checkout & lock
        </Button>
      </div>

      {#if repo.id === '5etools-utils'}
        <label class="follow-toggle">
          <input
            type="checkbox"
            checked={repo.lock.follow5ePackageJson}
            disabled={!!page.busy}
            onchange={(e) => page.setFollow(repo, e.currentTarget.checked)}
          />
          Auto-match 5e/package.json on Prepare
        </label>
      {/if}
      {#if repo.id === '5e-homebrew'}
        <label class="follow-toggle">
          <input
            type="checkbox"
            checked={repo.lock.follow5eDate}
            disabled={!!page.busy}
            onchange={(e) => page.setAnchor(repo, e.currentTarget.checked)}
          />
          Match 5e's commit date on Prepare
        </label>
      {/if}
      <Button
        variant={repo.lock.locked ? 'text' : 'outlined'}
        disabled={!!page.busy}
        onclick={() => page.toggleLock(repo)}
      >
        {repo.lock.locked ? 'Unlock' : 'Lock at current'}
      </Button>
    </div>
  {/if}
</Card>

<style>
  .repo-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);

    h3 {
      margin: 0;
      font-size: var(--text-lg);
    }
  }

  .repo-path {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  .repo-missing {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-sm);
  }

  /* ── Repos - Facts ──────────────────────────────────────────────────────── */
  .repo-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: var(--space-4) var(--space-6);
    margin: 0;

    dt {
      color: var(--text-muted);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
    }

    dd {
      margin: 0;
    }
  }

  .repo-fact-value {
    margin-block-start: var(--space-1);
    overflow-wrap: anywhere;
  }

  .repo-fact-sub {
    color: var(--text-faint);
    font-size: var(--text-xs);
  }

  /* ── Repos - Ref Switcher ───────────────────────────────────────────────── */
  .repo-card-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    padding-block-start: var(--space-4);
    border-block-start: 1px solid var(--border);
  }

  .repo-card-foot > :global(.button) {
    margin-inline-start: auto;
  }

  .ref-switcher {
    display: grid;
    flex: 1 1 32rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
  }

  .follow-toggle {
    display: flex;
    align-items: center;
    gap: var(--hm-space-1-5);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .ref-switcher {
      grid-template-columns: 1fr;
    }
  }
</style>
