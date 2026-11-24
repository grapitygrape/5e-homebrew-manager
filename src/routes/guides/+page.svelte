<!--
  Conversion Guides (Phase 1).

  Left: "Overview" (workspace status + coverage audit, the default page), then
  two lists from +page.ts — "Guides" (per-entity conversion guides,
  schema-backed) and "Documentation" (reference material with no entity schema).
  Centre: the Overview, or the selected document rendered with `marked`. The "Validate JSON"
  drawer is a paste-to-check tool (JsonValidatorPanel): it parses input, validates
  each entity against the live schema (engine.validateEntity), and shows a converted
  preview (engine.translateEntity). It only applies to conversion guides, so it's
  hidden for Documentation. The engine is pure, so it all runs client-side — lib/api
  only supplies guide text + schema.
-->
<script lang="ts">
  import { renderGuide } from '$lib/markdown';
  import { browser } from '$app/environment';
  import { getGuide, getGuideSchema, toEntitySchema } from '$lib/api';
  import type { EntitySchema } from '$lib/engine/audit';
  import type { PageProps } from './$types';
  import { errorText } from '$lib/util';
  import JsonValidatorPanel from '$lib/components/JsonValidatorPanel.svelte';
  import Button from '$lib/ui/Button.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Overview from './Overview.svelte';

  let { data }: PageProps = $props();

  // Both sidebar sections, flattened — used to resolve the selection's label and
  // whether it's a schema-backed conversion guide (validator) or documentation.
  const allDocs = $derived([...data.guides, ...data.docs]);

  // The picked document's file; null is the Overview, where the page opens.
  let selected = $state<string | null>(null);
  const current = $derived(allDocs.find((d) => d.file === selected) ?? null);
  const isGuide = $derived(current?.isGuide ?? false);
  let markdown = $state('');
  let schema = $state<EntitySchema | null>(null);
  let loadError = $state('');
  let drawerOpen = $state(false);
  // The validator checks JSON against a conversion guide's schema, so it never
  // shows for Documentation — gated here rather than reset, so the drawer comes
  // back as the user left it when they return to a guide.
  const showDrawer = $derived(drawerOpen && isGuide);
  let input = $state('');

  const renderedHtml = $derived(markdown ? renderGuide(markdown) : '');

  // The guide body element — Prism highlights the `language-*` code blocks inside
  // it (fenced JSON examples + the inline prop-card `<pre><code>` snippets).
  let mainEl = $state<HTMLElement | null>(null);

  // Re-run Prism whenever rendered content changes. Browser-only (no SSR), and
  // retried briefly in case the deferred Prism script hasn't loaded yet.
  function highlightSoon(el: HTMLElement, tries = 10) {
    if (window.Prism) {
      window.Prism.highlightAllUnder(el);
      return;
    }
    if (tries > 0) requestAnimationFrame(() => highlightSoon(el, tries - 1));
  }

  // Load markdown whenever the selection changes (race-guarded). Documentation
  // has no GUIDE_MAP entry, so there's no schema to fetch — skip that request;
  // the validator (which needs a schema) is hidden for those, see `showDrawer`.
  let loadSeq = 0;
  $effect(() => {
    const file = selected;
    const wantSchema = isGuide;
    if (!file) {
      markdown = '';
      schema = null;
      return;
    }
    const seq = ++loadSeq;
    loadError = '';
    void (async () => {
      try {
        const [md, guideSchema] = await Promise.all([
          getGuide(file).catch((err: Error) => err),
          wantSchema ? getGuideSchema(file) : Promise.resolve(null),
        ]);
        if (seq !== loadSeq) return;
        markdown = md instanceof Error ? '' : md;
        if (md instanceof Error)
          loadError = `Could not load document: ${md.message}`;
        schema = guideSchema ? toEntitySchema(guideSchema) : null;
      } catch (err) {
        if (seq === loadSeq) loadError = errorText(err);
      }
    })();
  });

  // Re-run Prism whenever rendered content or validator preview changes.
  // Browser-only (no SSR), and retried briefly in case deferred Prism hasn't loaded.
  $effect(() => {
    void renderedHtml;
    void input;
    void schema;
    void showDrawer;
    if (!browser || !mainEl) return;
    highlightSoon(mainEl);
  });
</script>

<section class="guides">
  <aside class="guide-list">
    <button
      class="guide-item"
      class:active={selected === null}
      onclick={() => (selected = null)}
    >
      Overview
    </button>

    {#if data.guides.length > 0}
      <h2 class="spaced">Guides</h2>
      {#each data.guides as g (g.file)}
        <button
          class="guide-item"
          class:active={g.file === selected}
          onclick={() => (selected = g.file)}
        >
          {g.label}
        </button>
      {/each}
    {/if}

    {#if data.docs.length > 0}
      <h2 class="spaced">Documentation</h2>
      {#each data.docs as d (d.file)}
        <button
          class="guide-item"
          class:active={d.file === selected}
          onclick={() => (selected = d.file)}
        >
          {d.label}
        </button>
      {/each}
    {/if}

    {#if allDocs.length === 0}
      <p class="muted">
        No guides found. Configure the guides folder in <a href="/settings"
          >Settings</a
        >.
      </p>
    {/if}
  </aside>

  <div class="guide-main" bind:this={mainEl}>
    <header class="guide-head">
      <h1>{selected ? (current?.label ?? 'Conversion Guides') : 'Overview'}</h1>
      {#if selected && isGuide}
        <Button
          variant="primary"
          onclick={() => (drawerOpen = !drawerOpen)}
          aria-expanded={drawerOpen}
        >
          {drawerOpen ? 'Hide validator' : 'Validate JSON'}
        </Button>
      {/if}
    </header>

    {#if showDrawer}
      <JsonValidatorPanel {schema} bind:input />
    {/if}

    {#if loadError}
      <EmptyState variant="error">{loadError}</EmptyState>
    {/if}

    {#if selected}
      <article class="markdown-body">{@html renderedHtml}</article>
    {:else if data.overview}
      <Overview data={data.overview} onselect={(file) => (selected = file)} />
    {:else}
      <EmptyState variant="error">Could not load the overview.</EmptyState>
    {/if}
  </div>
</section>

<style>
  .guides {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
  }
  .guide-list {
    border-right: 1px solid var(--border);
    padding: 1.25rem 0.875rem;
    background: var(--bg-sidebar);
    max-height: 100vh;
    overflow-y: auto;
  }
  .guide-list h2 {
    margin: 0 0 0.75rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--text-faint);
  }
  .guide-list h2.spaced {
    margin-top: 1.375rem;
    padding-top: 1.125rem;
    border-top: 1px solid var(--border);
  }
  .guide-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.625rem;
    margin-bottom: 0.125rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .guide-item:hover {
    background: var(--bg-hover);
    color: var(--text-main);
  }
  .guide-item.active {
    background: var(--bg-elevated);
    color: var(--text-main);
    box-shadow: inset 0.125rem 0 0 var(--gold);
  }
  .muted {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }

  .guide-main {
    padding-block: 1.75rem 5rem;
    padding-inline: 2rem;
    width: auto;
    overflow-y: auto;
    max-height: 100vh;
  }
  .guide-main > * {
    max-width: 900px;
  }
  .guide-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .guide-head h1 {
    margin: 0;
    font-size: var(--text-2xl);
  }

  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3) {
    margin-top: 1.625rem;
  }
  .markdown-body :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
  }
  .markdown-body :global(th),
  .markdown-body :global(td) {
    border: 1px solid var(--border);
    padding: 0.375rem 0.625rem;
    text-align: left;
    font-size: var(--text-sm);
  }
  .markdown-body :global(pre) {
    background: var(--bg-app);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.875rem 1.125rem;
    overflow-x: auto;
    margin: 1rem 0 1.375rem;
  }
  .markdown-body :global(pre code) {
    padding: 0;
    background: none;
    color: var(--text-main);
    font-size: var(--text-sm);
    line-height: var(--line-height-relaxed);
  }
  .markdown-body :global(:not(pre) > code) {
    background: var(--bg-elevated);
    padding: 0.1em 0.35em;
    border-radius: 0.25rem;
  }

  /* PrismJS token colours — tuned to the warm dark theme (matches the old tool's
     palette: gold keys, green strings, orange numbers, muted punctuation). Scoped
     to .guide-main so both guide code blocks and the converted preview pick it up. */
  .guide-main :global(.token.comment) {
    color: var(--text-faint);
  }
  .guide-main :global(.token.property) {
    color: var(--gold);
  }
  .guide-main :global(.token.string) {
    color: hsl(145 38% 60%);
  }
  .guide-main :global(.token.number),
  .guide-main :global(.token.boolean) {
    color: hsl(25 75% 62%);
  }
  .guide-main :global(.token.null),
  .guide-main :global(.token.keyword) {
    color: hsl(280 45% 68%);
  }
  .guide-main :global(.token.punctuation),
  .guide-main :global(.token.operator) {
    color: var(--text-muted);
  }

  /* Property cards — schema reference layout used inside guides */
  .markdown-body :global(.prop-cards) {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin: 1rem 0 1.375rem;
  }
  .markdown-body :global(.prop-card) {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .markdown-body :global(.prop-card-key) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 0.625rem 0.875rem;
    width: 15rem;
    flex-shrink: 0;
    background: var(--bg-app);
    border-right: 1px solid var(--border);
    word-wrap: anywhere;
  }
  .markdown-body :global(.prop-card-key > code) {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--gold);
    background: none;
    padding: 0;
    border: none;
  }
  .markdown-body :global(.prop-type) {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    padding: 1px 7px;
    white-space: nowrap;
  }
  .markdown-body :global(.prop-card-val) {
    flex: 1;
    min-width: 0;
    padding: 0.625rem 0.875rem;
    font-size: var(--text-sm);
    line-height: var(--line-height-normal);
  }
  .markdown-body :global(.prop-card-val p) {
    margin: 0;
  }
  .markdown-body :global(.prop-card-val strong) {
    display: inline-block;
    margin-top: 0.5rem;
    color: var(--text-main);
  }
  .markdown-body :global(.prop-card-val pre) {
    margin: 0.375rem 0 0.875rem;
  }
  .markdown-body :global(.prop-card-val > pre:last-child) {
    margin-bottom: 0;
  }

  @media (max-width: 860px) {
    .guides {
      grid-template-columns: 1fr;
    }
    .markdown-body :global(.prop-card) {
      flex-direction: column;
    }
    .markdown-body :global(.prop-card-key) {
      width: auto;
      border-right: none;
      border-bottom: 1px solid var(--border);
    }
  }
</style>
