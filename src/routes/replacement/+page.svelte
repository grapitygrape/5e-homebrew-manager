<!--
  Replace Content — manages `content-replacement.json` redirects.
  State and actions live in `state/replacement-page.svelte.ts`; picking new
  pairs lives at `/replacement/pick` sharing `state/supersessions.svelte.ts`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '$lib/ui/Banner.svelte';
  import FoundryScanModal from '$lib/components/replacement/FoundryScanModal.svelte';
  import DuplicatesModal from '$lib/components/replacement/DuplicatesModal.svelte';
  import MappingTable from '$lib/components/replacement/MappingTable.svelte';
  import ReplacementHeader from '$lib/components/replacement/ReplacementHeader.svelte';
  import ReplacementFilters from '$lib/components/replacement/ReplacementFilters.svelte';
  import { doc } from '$lib/state/supersessions.svelte.ts';
  import { ReplacementPage } from '$lib/state/replacement-page.svelte.ts';
  import { buildScanRules } from '$lib/engine/foundry/replacements.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const page = new ReplacementPage();

  onMount(() => page.mount());
</script>

<section class="cr">
  <ReplacementHeader
    {page}
    authoringPath={data.authoringPath}
    deployPath={data.deployPath}
    canDeploy={data.canDeploy}
  />

  {#if page.scanningFoundry}
    <FoundryScanModal
      rules={buildScanRules(doc.rows)}
      onclose={() => (page.scanningFoundry = false)}
    />
  {/if}

  {#if page.viewingDuplicates}
    <DuplicatesModal
      duplicates={page.pendingDuplicates}
      onadd={page.addDuplicate}
      ondismiss={page.dismissDuplicate}
      onclose={() => (page.viewingDuplicates = false)}
    />
  {/if}

  {#if page.banner}
    <Banner
      tone={page.banner.tone}
      text={page.banner.text}
      ondismiss={() => (page.banner = null)}
    />
  {/if}

  <ReplacementFilters {page} />

  {#if page.loading}
    <p class="muted">Reading the mapping file.</p>
  {:else if !doc.rows.length && !doc.review.length && !doc.overrides.length}
    <p class="muted">
      Nothing mapped yet. <b>Add a replacement</b> pairs your homebrew with what
      it supersedes; <b>Rescan</b> reads the "Replaces:" markers already in the corpus.
    </p>
  {:else if !page.visibleOverrides.length && !page.groups.length && !page.visibleReview.length && !page.visibleSuggestions.length}
    <p class="muted">Nothing matches those filters.</p>
  {:else}
    <MappingTable
      overrides={page.visibleOverrides}
      groups={page.groups}
      review={page.visibleReview}
      suggestions={page.visibleSuggestions}
      swapped={page.swapped}
      blockIx={page.blockIx}
      onEditOverride={page.editOverride}
      onDeleteOverride={page.deleteOverride}
      onEdit={page.editGroup}
      onDelete={page.deleteGroup}
      onDismissReview={page.dismissReview}
      onAddReview={page.acceptReview}
      onAddSuggestion={page.addSuggestion}
      onDismissSuggestion={page.dismissSuggestion}
    />
  {/if}

  {#if data.deployPath}
    <p class="hint deploy-note">
      {#if doc.deployedExists}Live at <code>{data.deployPath}</code>{:else}Not
        deployed yet - the site won't see these until you Deploy{/if}
    </p>
  {/if}
</section>

<style>
  .cr {
    padding-block: 1.75rem;
    padding-inline: 2rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .muted {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .hint {
    margin: 0.375rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .deploy-note {
    margin-top: 0.75rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--border);
  }
</style>
