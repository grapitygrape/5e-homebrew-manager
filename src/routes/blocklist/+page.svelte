<!--
  Hide Content — manages `content-blocklist.json` across the Sources tree and
  working Rules pane. Document state, import/export, save, and deploy live in
  `state/blocklist-page.svelte.ts`.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import BlocklistBanner from '$lib/components/blocklist/BlocklistBanner.svelte';
  import BlocklistHeader from '$lib/components/blocklist/BlocklistHeader.svelte';
  import ChildCascadeModal from '$lib/components/blocklist/ChildCascadeModal.svelte';
  import SourcesPane from '$lib/components/blocklist/SourcesPane.svelte';
  import RulesPane from '$lib/components/blocklist/RulesPane.svelte';
  import { BlocklistPage } from '$lib/state/blocklist-page.svelte.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
  const page = new BlocklistPage();

  onMount(() => page.mount());
</script>

<section class="bl">
  <div class="main">
    <BlocklistHeader
      {page}
      canSave={data.canSave}
      canDeploy={data.canDeploy}
    />

    <BlocklistBanner
      banner={page.banner}
      collapsed={page.collapsed}
      unmatchedCount={page.unmatched.length}
      ondismiss={() => page.setBanner(null)}
    />

    <div class="panes">
      <SourcesPane
        dataPath={data.dataPath}
        indexWarm={data.indexWarm}
        bind:entries={page.entries}
        onbanner={page.setBanner}
        onerror={(text) => page.setBanner({ tone: 'error', text })}
        confirmCascade={page.confirmCascade}
      />
      <RulesPane
        entries={page.entries}
        diagnoses={page.diagnoses}
        loading={page.loadingList}
        bind:ruleQuery={page.ruleQuery}
        onremove={page.removeRule}
      />
    </div>
  </div>
</section>

{#if page.pendingCascade}
  <ChildCascadeModal
    {...page.pendingCascade.prompt}
    onchoose={page.answerCascade}
  />
{/if}

<style>
  /* height:100vh + min-height:0 on every flex/grid child is what lets each pane
     scroll on its own instead of the page scrolling. */
  .bl {
    display: grid;
    grid-template-columns: 1fr;
    height: 100vh;
    min-height: 0;
  }

  .main {
    padding-block: 1.75rem;
    padding-inline: 2rem;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* The sources tree carries five columns now - abbreviation, title, tags,
     added and count - so it gets the wider half. */
  .panes {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 1rem;
  }

  @media (max-width: 1100px) {
    .panes {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 860px) {
    .bl {
      grid-template-columns: 1fr;
      height: auto;
    }
  }
</style>
