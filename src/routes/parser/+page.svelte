<!--
  Homebrew Parser (Phase 2).

  A CodeMirror 6 JSON editor on the left, a validated/nested outline on the right,
  kept in sync both ways. The *logic* (collect arrays → validate → nest → link
  audit) lives in the pure, tested engine; ParserController
  (lib/state/parser-controller.svelte.ts) owns the editor, the parse pipeline
  and the position cache that maps outline rows ↔ editor offsets, and
  lib/editor/parser-cm.ts holds the CodeMirror decorations.

  - ParserToolbar: title, stats, file and prompt actions, status line.
  - OutlinePane: Objects tree, Errors tab, and the Resolved / Checks tabs.
    Resolved is the selected object after `_copy`/`_mod`/`_templates`/
    `_versions` (POST /api/resolve, the unsaved document overlaying the
    corpus). Checks is the homebrew repo's CI rules + collisions for the whole
    document (POST /api/lint with the editor text).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { ParserController } from '$lib/state/parser-controller.svelte';
  import PasteDialog from '$lib/components/PasteDialog.svelte';
  import ParserToolbar from '$lib/components/parser/ParserToolbar.svelte';
  import OutlinePane from '$lib/components/parser/OutlinePane.svelte';

  const ctl = new ParserController({
    file: page.url.searchParams.get('file') ?? '',
    repo: page.url.searchParams.get('repo') ?? '',
  });

  let editorEl: HTMLDivElement;
  onMount(() => ctl.mount(editorEl));
</script>

<section class="parser">
  <ParserToolbar {ctl} />

  {#if ctl.dialog === 'convert'}
    <PasteDialog
      title="Add content"
      intro="Paste rules text, a statblock, a table or a PDF excerpt. This copies a prompt for a model: where the guides and data are, the rules for this file, and the reply format Merge reply reads. Nothing is converted here."
      placeholder="Paste the text to convert."
      action="Copy prompt"
      busyAction="Copying…"
      bind:value={ctl.convertText}
      onsubmit={ctl.copyConvert}
      onclose={() => (ctl.dialog = null)}
    />
  {:else if ctl.dialog === 'merge'}
    <PasteDialog
      title="Merge reply"
      intro="Paste the model's reply. Its JSON is merged into the editor: an entry with the same name and source replaces the one there, the rest are added, and its dependencies go into _meta. Ctrl+Z undoes it. Nothing is saved to disk."
      placeholder={'```json\n{ "spell": [ … ] }\n```'}
      action="Merge"
      busyAction="Merging…"
      bind:value={ctl.replyText}
      onsubmit={ctl.mergeReply}
      onclose={() => (ctl.dialog = null)}
    />
  {/if}

  <div class="panes">
    <div class="editor-pane">
      <div class="cm-host" bind:this={editorEl}></div>
    </div>

    <OutlinePane {ctl} />
  </div>
</section>

<style>
  .parser {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 0;
    border-top: 1px solid var(--border);
  }
  .editor-pane {
    min-width: 0;
    border-right: 1px solid var(--border);
    display: flex;
    overflow-y: auto;
  }
  .cm-host {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  :global(.cm-host .cm-editor) {
    height: 100%;
    font-size: var(--text-xs);
    line-height: var(--line-height-normal) 5;
  }

  /* editor decoration classes (applied via CM Decoration, see lib/editor/parser-cm.ts) */
  :global(.cm-hb-highlighted) {
    background-color: hsl(38 56% 50% / 0.1);
  }
  :global(.cm-hb-highlighted-strong) {
    background-color: hsl(38 56% 50% / 0.22);
  }
  :global(.cm-hb-error-line) {
    background-color: hsl(2 70% 56% / 0.13);
  }
  :global(.cm-hb-warning-line) {
    background-color: hsl(38 80% 56% / 0.12);
  }
  :global(.cm-hb-ref) {
    background-color: hsl(210 40% 60% / 0.08);
    border-radius: 0.25rem;
  }
  :global(.cm-hb-ref-tag) {
    color: hsl(210 60% 70%);
  }
  :global(.cm-hb-ref-source) {
    color: var(--text-faint);
  }
  :global(.cm-hb-link-broken) {
    background-color: hsl(2 70% 56% / 0.2);
    text-decoration: underline wavy hsl(2 70% 60%);
    text-underline-offset: 0.25rem;
    border-radius: 0.25rem;
  }
  :global(.cm-hb-link-warn) {
    background-color: hsl(38 80% 56% / 0.16);
    text-decoration: underline wavy hsl(38 80% 56%);
    text-underline-offset: 0.25rem;
    border-radius: 0.25rem;
  }
  :global(.hb-link-tip) {
    max-width: 380px;
    padding: 0.375rem 0.625rem;
    font-size: var(--text-xs);
    line-height: var(--line-height-snug);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }
  :global(.hb-link-tip.error) {
    border-left: 0.25rem solid var(--danger);
  }
  :global(.hb-link-tip.warning) {
    border-left: 0.25rem solid var(--warn);
  }

  @media (max-width: 860px) {
    .panes {
      grid-template-columns: 1fr;
    }
  }
</style>
