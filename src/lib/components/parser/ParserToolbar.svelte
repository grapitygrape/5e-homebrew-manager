<!--
  ParserToolbar — the Parser's header: title and issue stats (Errors/Warnings
  jump to the next issue, Alt+E), the file and prompt actions, and a status
  line with the open file, schema status, the last action's outcome and the
  Shortcuts popover.
-->
<script lang="ts">
  import type { ParserController } from '$lib/state/parser-controller.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';

  let { ctl }: { ctl: ParserController } = $props();

  // The Shortcuts popover. Keys are `+`-joined.
  const SHORTCUTS: [string, string][] = [
    ['Ctrl+Space', 'Suggest properties, values and templates'],
    ['Alt+E', 'Next error or warning'],
    ['F8', 'Next schema error'],
    ['Alt+T', 'Wrap the selection in a {@tag}'],
    ['Ctrl+S', 'Save'],
    ['Ctrl+F', 'Find and replace'],
  ];
</script>

<header class="parser-head">
  <div class="head-title">
    <div class="head-name">
      <h1>Homebrew Parser</h1>
      {#if ctl.parsed || ctl.isEntry}
        <div
          class="stats"
          class:has-issues={ctl.totalErrors + ctl.totalWarnings > 0}
        >
          {#if ctl.parsed}
            <span>Objects <b>{ctl.parsed.totals.objects}</b></span><i>·</i>
            <span>Types <b>{ctl.parsed.totals.types}</b></span><i>·</i>
          {:else}
            <span>Entry</span><i>·</i>
          {/if}
          <button
            type="button"
            class="stats-jump"
            onclick={ctl.gotoNextIssue}
            disabled={ctl.totalErrors + ctl.totalWarnings === 0}
            title="Jump to the next error or warning (Alt+E)"
          >
            <span
              >Errors <b class:err={ctl.totalErrors}>{ctl.totalErrors}</b></span
            ><i>·</i>
            <span
              >Warnings <b class:warn={ctl.totalWarnings}>{ctl.totalWarnings}</b
              ></span
            >
          </button><i>·</i>
          {#if ctl.linkTotals}
            <span
              title="Of which content-link issues: {ctl.linkTotals
                .brokenLinks} errors, {ctl.linkTotals
                .linkWarnings} warnings — see the Errors tab"
              ><i class="fa-sharp-duotone fa-regular fa-link" aria-hidden="true"
              ></i>
              <b class:err={ctl.linkTotals.brokenLinks}
                >{ctl.linkTotals.brokenLinks}</b
              >+<b class:warn={ctl.linkTotals.linkWarnings}
                >{ctl.linkTotals.linkWarnings}</b
              ></span
            ><i>·</i>
          {/if}
          {#if ctl.parsed}<span>Clean <b class="ok">{ctl.cleanCount}</b></span
            >{/if}
        </div>
      {/if}
    </div>
    <div class="head-actions">
      <Button
        onclick={ctl.newSource}
        title="Start an empty brew in the editor: a _meta with one source to rename, ready for Add content and Merge reply"
      >
        New source
      </Button>
      <Button
        onclick={() => (ctl.dialog = 'convert')}
        title="Paste text to convert and copy a prompt that tells a model how to turn it into homebrew for this file"
      >
        Add content
      </Button>
      {#if ctl.parsed}
        <Button
          onclick={ctl.copyPrompt}
          disabled={!ctl.docRecord || ctl.prompting}
          title="Copy a prompt listing every problem, the entities' JSON and the guides to follow, for a model to fix"
        >
          {ctl.prompting ? 'Copying…' : 'Copy fixes'}
        </Button>
      {/if}
      <Button
        onclick={() => (ctl.dialog = 'merge')}
        title="Paste a model's JSON reply and merge its entries into the editor"
      >
        Merge new content
      </Button>
      {#if ctl.canSave}
        <Button
          variant="primary"
          onclick={ctl.save}
          disabled={!ctl.dirty || ctl.saving}
          title="Save the editor back to {ctl.fileName} in the homebrew folder (Ctrl+S)"
        >
          {ctl.saving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          onclick={ctl.deploy}
          disabled={ctl.deploying}
          title="Save any changes, then copy {ctl.fileName} to the deploy folders in Settings"
        >
          {ctl.deploying ? 'Deploying…' : 'Deploy'}
        </Button>
      {/if}
    </div>
  </div>
  <div class="head-status">
    {#if ctl.fileOrigin}
      <span class="open-file" title={ctl.fileName}>
        <i class="fa-sharp-duotone fa-regular fa-file-code" aria-hidden="true"
        ></i>
        <span class="open-file-name">{ctl.fileName}</span>
        <span class="open-file-origin">{ctl.fileOrigin}</span>
        {#if ctl.dirty}<Badge variant="warning">Unsaved</Badge>{/if}
        {#if ctl.repoFile}<span class="open-file-origin"
            >· add it from Files to save or deploy it</span
          >{/if}
      </span>
    {:else}
      <p>
        Paste a full homebrew file to outline every object and surface
        validation issues, or a single entry to preview it.
      </p>
    {/if}
    {#if ctl.schemaStatus.state === 'fallback'}
      <StatusText
        class="head-note"
        variant="warning"
        title="Checked against each type's properties only: required properties and unknown keys, not values or nested entries"
        >Full schema checks are off: {ctl.schemaStatus.reason}.</StatusText
      >
    {/if}
    {#if ctl.note}
      <StatusText class="head-note" variant={ctl.note.ok ? 'ok' : 'error'}
        >{ctl.note.text}</StatusText
      >
      {#each ctl.note.warnings ?? [] as w (w)}
        <StatusText class="head-note" variant="warning">{w}</StatusText>
      {/each}
    {/if}
    <div class="shortcut-hint">
      <button
        type="button"
        class="shortcut-hint-button"
        aria-describedby="parser-shortcuts"
      >
        <i class="fa-sharp-duotone fa-regular fa-keyboard" aria-hidden="true"
        ></i>
        Shortcuts
      </button>
      <div class="shortcut-hint-panel" id="parser-shortcuts" role="tooltip">
        <dl>
          {#each SHORTCUTS as [keys, what] (keys)}
            <dt>
              {#each keys.split('+') as k, i (i)}{#if i}+{/if}<kbd>{k}</kbd
                >{/each}
            </dt>
            <dd>{what}</dd>
          {/each}
        </dl>
        <p>
          <b>Templates:</b> in an array, press <kbd>Ctrl</kbd>+<kbd>Space</kbd>
          and pick a type (<code>list</code>, <code>vehicle</code>…). At the top
          level, pick an array name such as <code>vehicle</code> to start it with
          one template inside.
        </p>
      </div>
    </div>
  </div>
</header>

<style>
  .parser-head {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-block: 1.25rem 0.75rem;
    padding-inline: 2rem;
  }
  .head-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .parser-head h1 {
    margin: 0;
    font-size: var(--text-2xl);
  }
  .head-name {
    min-width: 0;
  }
  .parser-head p {
    margin: 0;
    margin-block-start: 0.25rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Open file, stats and the last action's message share one line */
  .head-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1.25rem;
    font-size: var(--text-xs);
  }
  .open-file {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .open-file-name {
    color: var(--text-main);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-xs);
  }
  .open-file-origin {
    flex-shrink: 0;
  }
  .stats {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
  }
  .stats b {
    color: var(--text-main);
  }
  .stats b.err {
    color: var(--danger);
  }
  .stats b.warn {
    color: var(--warn);
  }
  .stats b.ok {
    color: var(--ok);
  }
  .stats i {
    color: var(--text-faint);
  }
  /* Errors and Warnings: one button that jumps to the next issue (Alt+E). */
  .stats-jump {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .stats-jump:disabled {
    cursor: default;
  }
  .stats-jump:not(:disabled):is(:hover, :focus-visible) span {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  /* Shortcuts popover, right-aligned on the status line */
  .shortcut-hint {
    position: relative;
    margin-inline-start: auto;
  }
  .shortcut-hint-button {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding-block: 0.125rem;
    padding-inline: 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-muted);
    font: inherit;
    cursor: help;
  }
  .shortcut-hint-button:is(:hover, :focus-visible) {
    border-color: var(--border-strong);
    color: var(--text-main);
  }
  .shortcut-hint-panel {
    display: none;
    position: absolute;
    inset-block-start: 100%;
    inset-inline-end: 0;
    z-index: 20;
    inline-size: 24rem;
    padding: 0.75rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--bg-elevated);
    box-shadow: 0 0.5rem 1.5rem oklch(0% 0 0 / 40%);
    color: var(--text-main);
    font-size: var(--text-xs);
  }
  .shortcut-hint:is(:hover, :focus-within) .shortcut-hint-panel {
    display: block;
  }
  .shortcut-hint-panel dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.375rem 0.75rem;
    margin: 0;
  }
  .shortcut-hint-panel dt {
    white-space: nowrap;
  }
  .shortcut-hint-panel dd {
    margin: 0;
    color: var(--text-muted);
  }
  .shortcut-hint-panel p {
    margin: 0;
    margin-block-start: 0.75rem;
    padding-block-start: 0.625rem;
    border-block-start: 1px solid var(--border);
    color: var(--text-muted);
    font-size: inherit;
  }
  .shortcut-hint-panel kbd {
    padding-inline: 0.25rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-panel);
    font-family: var(--font-mono);
    font-size: var(--hm-text-2xs);
  }
</style>
