<!--
  HomebrewFileRow - one homebrew file in the Files list: a one-line toggle
  (name, then a byline of source, file name, authors, date, size and any
  newer upstream copy), expanding to its actions (Parser, scan, lint, fix
  prompt, Foundry check, deploy, remove), entity counts and each action's
  result. The results live in FilesPage so they survive a search.
-->
<script lang="ts">
  import { formatFileSize, formatLocalDate, formatNumber } from '$lib/util';
  import type { HomebrewFiles } from '$lib/api';
  import type { FilesPage } from '$lib/state/files-page.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import Link from '$lib/ui/Link.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import CheckIssueList from '$lib/components/checks/CheckIssueList.svelte';
  import ScanSummary from './ScanSummary.svelte';

  type FileRow = HomebrewFiles['homebrew']['files'][number];
  type Upstream = HomebrewFiles['upstream'][string];

  let {
    f,
    upstream,
    canDeploy,
    page,
  }: {
    f: FileRow;
    /** The homebrew repo's newer copy of this file, if there is one. */
    upstream?: Upstream;
    canDeploy: boolean;
    page: FilesPage;
  } = $props();

  type BylinePart = {
    kind: 'source' | 'file' | 'authors' | 'date' | 'size' | 'upstream';
    text: string;
  };

  const byline = $derived(
    (
      [
        // The brew's own source id; SourceTag draws it as its prefix.
        { kind: 'source', text: f.sources[0]?.json ?? '' },
        { kind: 'file', text: f.file },
        { kind: 'authors', text: f.authors },
        { kind: 'date', text: formatLocalDate(f.mtime) },
        { kind: 'size', text: formatFileSize(f.size) },
        {
          kind: 'upstream',
          text: upstream
            ? `Repo updated ${formatLocalDate(upstream.updated * 1000)}`
            : '',
        },
      ] satisfies BylinePart[]
    ).filter((p) => p.text),
  );

  /** Hover text for the upstream warning: what's newer and why it matters. */
  const upstreamTitle = $derived(
    upstream
      ? `The homebrew repo's ${upstream.folder}/${f.file} changed on ${formatLocalDate(upstream.updated * 1000)}, after this copy (${formatLocalDate(upstream.local * 1000)}). Update this copy from the repo before fixing it, or the fixed file will undo upstream's changes.`
      : '',
  );

  const open = $derived(page.expanded.has(f.file));
  const s = $derived(page.scans[f.file]);
</script>

<div class="file-row" class:open class:invalid={!!f.error}>
  <button
    type="button"
    class="file-toggle"
    aria-expanded={open}
    onclick={() => page.toggleRow(f.file)}
  >
    <span class="chev" class:open aria-hidden="true">›</span>
    <span class="file-text">
      <span class="fname" title={f.file}>{f.name}</span>
      <span class="fmeta">
        {#each byline as part, i (part.kind)}
          {#if i}<span class="pipe" aria-hidden="true">|</span>{/if}<span
            class="fmeta-{part.kind}"
            >{#if part.kind === 'source'}<SourceTag
                source={part.text}
              />{:else if part.kind === 'upstream'}<StatusText
                variant="warning"
                title={upstreamTitle}>{part.text}</StatusText
              >{:else}{part.text}{/if}</span
          >
        {/each}
      </span>
    </span>
  </button>
  {#if open}
    <div class="file-detail">
      <div class="factions">
        <Link href="/parser?file={encodeURIComponent(f.file)}"
          >Open in Parser</Link
        >
        <Button
          onclick={() => page.scan(f.file)}
          disabled={!!f.error || page.scanning.has(f.file)}
        >
          {page.scanning.has(f.file) ? 'Scanning…' : 'Scan for errors'}
        </Button>
        <Button
          onclick={() => page.lint(f.file)}
          disabled={!!f.error || page.linting.has(f.file)}
          title="Run the homebrew repo's contribution checks (_meta, timestamps, file name, sources, edition, dependencies) and list this file's collisions"
        >
          {page.linting.has(f.file) ? 'Linting…' : 'Submission lint'}
        </Button>
        <Button
          onclick={() => page.copyPrompt(f.file)}
          disabled={!!f.error || page.prompting.has(f.file)}
          title="Scan and lint this file, then copy a prompt listing every problem, the entities' JSON and the guides to follow, for a model to fix"
        >
          {page.prompting.has(f.file) ? 'Copying…' : 'Copy fixes'}
        </Button>
        <Button
          class="foundry"
          onclick={() => page.checkFoundry(f.file)}
          disabled={!!f.error ||
            !page.bridge.connected ||
            page.checking.has(f.file)}
          title={page.bridge.connected
            ? 'Look for this file’s items, spells and features in the connected world'
            : 'Needs a Foundry world connected via the Homebrew Manager Bridge module'}
        >
          {page.checking.has(f.file) ? 'Checking…' : 'Check Foundry'}
        </Button>
        {#if canDeploy}
          <Button
            variant="outlined"
            onclick={() => page.deploy(f.file)}
            disabled={!!f.error || page.deploying.has(f.file)}
            title="Copy this file into the configured Foundry and/or Deployed homebrew folders, overwriting"
          >
            {page.deploying.has(f.file) ? 'Deploying…' : 'Deploy'}
          </Button>
        {/if}
        <Button
          variant="text"
          onclick={() => page.remove(f.file)}
          disabled={page.removing.has(f.file)}
          title="Move this file into unused/ in the homebrew + Deployed homebrew folders and drop it from index.json"
        >
          {page.removing.has(f.file) ? 'Removing…' : 'Remove'}
        </Button>
      </div>
      <div class="fcounts">
        {#if f.error}
          <StatusText variant="error">Invalid JSON — {f.error}</StatusText>
        {:else if Object.keys(f.counts).length}
          {#each Object.entries(f.counts) as [k, n] (k)}
            <Badge prefix={formatNumber(n)} suffix={k} />
          {/each}
        {:else}
          <span class="muted">No recognized entities</span>
        {/if}
      </div>
      {#if page.checkErrors[f.file]}
        <StatusText as="div" class="scan" variant="error"
          >{page.checkErrors[f.file]}</StatusText
        >
      {/if}
      {#if page.deployNote[f.file]?.text}
        <StatusText
          as="div"
          class="scan"
          variant={page.deployNote[f.file].ok ? 'ok' : 'error'}
        >
          {page.deployNote[f.file].text}
        </StatusText>
      {/if}
      {#if page.promptNote[f.file]}
        <StatusText
          as="div"
          class="scan"
          variant={page.promptNote[f.file].ok ? 'ok' : 'error'}
        >
          {page.promptNote[f.file].text}
        </StatusText>
      {/if}
      {#if page.lints[f.file]}
        {@const l = page.lints[f.file]}
        <div class="scan">
          {#if 'error' in l}
            <StatusText variant="error">Lint failed — {l.error}</StatusText>
          {:else}
            <div class="lhead">
              <StatusText variant={l.lint.totals.errors ? 'error' : 'ok'}
                >{l.lint.totals.errors} CI
                {l.lint.totals.errors === 1
                  ? 'failure'
                  : 'failures'}</StatusText
              >
              ·
              <StatusText
                variant={l.lint.totals.warnings ? 'warning' : 'default'}
                >{l.lint.totals.warnings}
                {l.lint.totals.warnings === 1
                  ? 'warning'
                  : 'warnings'}</StatusText
              >
              {#if l.collisions.length}
                ·
                <StatusText variant="error"
                  >{l.collisions.length}
                  {l.collisions.length === 1
                    ? 'collision'
                    : 'collisions'}</StatusText
                >
              {/if}
              {#if l.lint.folder}
                · repo folder <code>{l.lint.folder}/</code>
              {/if}
            </div>
            <CheckIssueList
              issues={l.lint.issues.filter((i) => i.rule !== 'folder')}
              collisions={l.collisions}
            />
          {/if}
        </div>
      {/if}
      {#if s}
        <div class="scan">
          <ScanSummary scan={s} />
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .file-row {
    border-block-end: 1px solid var(--border);
    border-inline-start: 0.125rem solid transparent;
  }
  .file-row.open {
    border-inline-start-color: var(--gold);
  }
  .file-toggle {
    display: flex;
    align-items: baseline;
    gap: var(--hm-space-1-5);
    inline-size: 100%;
    padding-block: 0.1875rem 0.3125rem;
    padding-inline: var(--file-pad-inline);
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-main);
    font: inherit;
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
  }
  .file-toggle:hover {
    background: var(--bg-hover);
  }
  .chev {
    flex: 0 0 var(--file-chev-size);
    color: var(--gold);
    transition: transform 0.12s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .file-text {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
  }
  .fname {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-row.invalid .fname {
    color: var(--danger);
  }
  .fmeta {
    display: flex;
    align-items: center;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
  }
  /* Only the authors give way; prefix, filename, date and size stay whole. */
  .fmeta > span {
    flex-shrink: 0;
  }
  .fmeta > .fmeta-authors {
    flex-shrink: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pipe {
    flex-shrink: 0;
    color: var(--text-faint);
    margin-inline: 0.5rem;
  }

  /* Expanded row: indented to line up with the name, past the chevron. The
     --file-* sizes come from the list (.flist on the Files page). */
  .file-detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block: var(--space-1) var(--space-3);
    padding-inline: calc(
        var(--file-pad-inline) + var(--file-chev-size) + var(--hm-space-1-5)
      )
      var(--file-pad-inline);
  }
  .factions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .factions :global(.button) {
    font-size: var(--text-xs);
    padding: 0.375rem 0.75rem;
  }
  .factions :global(.button.foundry:not(:disabled)) {
    border-color: hsl(140 45% 50% / 0.45);
    color: var(--ok);
  }
  .fcounts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    font-size: var(--text-xs);
  }
  .muted {
    color: var(--text-faint);
  }
  .scan {
    font-size: var(--text-xs);
    color: var(--text-muted);
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
  }
  .lhead {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.5rem;
  }
</style>
