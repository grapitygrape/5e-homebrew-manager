<!--
  PreviewPane — what the Parser's outline shows for "see it rendered": a bare
  entry's preview, or the selected object resolved after `_copy`/`_mod`/
  `_templates`/`_versions` (POST /api/resolve, with the unsaved document
  overlaying the corpus). ResolvedPanel draws the result, trace and versions.
-->
<script lang="ts">
  import type { ParserController } from '$lib/state/parser-controller.svelte';
  import { entityLabel } from '$lib/state/parser-controller.svelte';
  import ResolvedPanel from '$lib/components/checks/ResolvedPanel.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import EntityLabel from './EntityLabel.svelte';

  let { ctl }: { ctl: ParserController } = $props();
</script>

{#if ctl.isEntry}
  <div class="entry-preview">
    {#if ctl.entryHtml}{@html ctl.entryHtml}{:else}<EmptyState
        >Nothing to show.</EmptyState
      >{/if}
  </div>
{:else if ctl.activeNode && ctl.docRecord}
  <div class="resolved-head">
    <EntityLabel
      type={ctl.activeNode.type}
      name={entityLabel(ctl.activeNode)}
    />
  </div>
  <ResolvedPanel
    type={ctl.activeNode.type}
    entityIdx={ctl.activeNode.entityIdx}
    doc={ctl.docRecord}
    file={ctl.fileParam || undefined}
  />
{:else}
  <EmptyState>
    Put the cursor in an object (or pick one in Objects) to see it resolved.
  </EmptyState>
{/if}

<style>
  .resolved-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem 0;
  }

  /* Preview of a bare entry */
  .entry-preview {
    padding-block: 0.75rem;
    padding-inline: 1rem;
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }
</style>
