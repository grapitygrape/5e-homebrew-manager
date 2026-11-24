<!--
  Schema Reference — a generated, schema-driven reference + validator for EVERY
  homebrew entity type (variants, bookData, monster, …), not just the markdown
  guides. The property table and required flags come from lib/api getTypeSchema
  (engine.buildTypeSchema). Validation and preview run purely client-side via
  JsonValidatorPanel (engine.validateEntity + engine.translateEntity).
-->
<script lang="ts">
  import type { PageProps } from './$types';
  import { sampleValidatorJson } from '$lib/validate-json';
  import { errorText } from '$lib/util';
  import JsonValidatorPanel from '$lib/components/JsonValidatorPanel.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import Button from '$lib/ui/Button.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import type { EntitySchema } from '$lib/engine/audit';
  import { getTypeSchema, toEntitySchema } from '$lib/api';

  let { data }: PageProps = $props();

  let chosen = $state<string | null>(null);
  const selected = $derived(chosen ?? data.types[0]?.type ?? null);
  let filter = $state('');
  let schema = $state<EntitySchema | null>(null);
  let loadError = $state('');
  let input = $state('');

  const filtered = $derived(
    filter.trim()
      ? data.types.filter((t) =>
          `${t.label} ${t.type}`.toLowerCase().includes(filter.toLowerCase()),
        )
      : data.types,
  );

  // Load the schema for the selected type.
  let loadSeq = 0;
  $effect(() => {
    const type = selected;
    if (!type) {
      schema = null;
      return;
    }
    const seq = ++loadSeq;
    loadError = '';
    void (async () => {
      try {
        const typeSchema = await getTypeSchema(type);
        if (seq !== loadSeq) return;
        schema = typeSchema ? toEntitySchema(typeSchema) : null;
        if (!typeSchema) loadError = `No schema declared for ${type}.`;
      } catch (e) {
        if (seq === loadSeq) loadError = errorText(e);
      }
    })();
  });

  function insertSample() {
    input = sampleValidatorJson(schema);
  }
</script>

<section class="ref">
  <aside class="type-nav">
    <h2>Schema Types</h2>
    <TextInput
      class="filter"
      placeholder="Filter types."
      bind:value={filter}
      aria-label="Filter types"
    />
    <div class="type-list">
      {#each filtered as t (t.type)}
        <button
          class="type-item"
          class:active={t.type === selected}
          onclick={() => (chosen = t.type)}
        >
          <span class="ti-label">{t.label}</span>
          <span class="ti-key">{t.type}</span>
        </button>
      {/each}
      {#if filtered.length === 0}<p class="muted">
          No types match.{#if data.types.length === 0}
            Configure a schema source in Settings.{/if}
        </p>{/if}
    </div>
  </aside>

  <div class="ref-main">
    {#if loadError}
      <EmptyState variant="error">{loadError}</EmptyState>
    {:else if !schema}
      <EmptyState>Select a type to see its schema reference.</EmptyState>
    {:else}
      <header class="ref-head">
        <div>
          <h1>{schema.label}</h1>
          <p class="meta">
            <code>{schema.arrayProp}</code> · renders as
            <code>{schema.entityType}</code>
            ·
            {schema.properties.length} properties · {schema.required.length} required
          </p>
        </div>
        <Button variant="primary" onclick={insertSample}>Insert example</Button>
      </header>

      {#if schema.required.length}
        <p class="required-line">
          <strong>Required:</strong>
          {#each schema.required as r (r)}<code class="req">{r}</code>{/each}
        </p>
      {/if}

      <JsonValidatorPanel {schema} bind:input showInsertSample={false} />

      <!-- Generated property reference -->
      <h2 class="props-h">Properties</h2>
      <div class="table-wrap">
        <table>
          <thead
            ><tr
              ><th>Property</th><th>Type</th><th>Req</th><th>Description</th
              ></tr
            ></thead
          >
          <tbody>
            {#each schema.properties as p (p.name)}
              <tr>
                <td><code>{p.name}</code></td>
                <td class="ty">{p.type}</td>
                <td
                  >{#if p.required}<Badge variant="danger">yes</Badge>{/if}</td
                >
                <td class="desc">{p.description}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</section>

<style>
  .ref {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: 100vh;
  }
  .type-nav {
    border-right: 1px solid var(--border);
    padding: 1.25rem 0.875rem;
    background: var(--bg-sidebar);
    display: flex;
    flex-direction: column;
    min-height: 0;
    width: 240px;
    height: 100vh;
    overflow-y: auto;
  }
  .type-nav h2 {
    margin: 0 0 0.625rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--text-faint);
  }
  .type-nav :global(.filter) {
    width: 100%;
    margin-bottom: 0.625rem;
  }
  .type-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .type-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    text-align: left;
    padding: 0.375rem 0.625rem;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }
  .type-item:hover {
    background: var(--bg-hover);
    color: var(--text-main);
  }
  .type-item.active {
    background: var(--bg-elevated);
    color: var(--text-main);
    box-shadow: inset 0.125rem 0 0 var(--gold);
  }
  .ti-label {
    font-size: var(--text-sm);
  }
  .ti-key {
    font-size: var(--text-xs);
    color: var(--text-faint);
    font-family: var(--font-mono);
  }
  .muted {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }

  .ref-main {
    padding-block: 1.75rem 5rem;
    padding-inline: 2rem;
    width: auto;
    overflow-y: auto;
    max-height: 100vh;
  }
  .ref-main > * {
    max-width: 980px;
  }
  .ref-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .ref-head h1 {
    margin: 0 0 0.25rem;
    font-size: var(--text-2xl);
  }
  .ref-head .meta {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .required-line {
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin-block: 0.625rem 1.25rem;
  }
  .required-line .req {
    margin-inline-end: 0.375rem;
  }

  .props-h {
    font-size: var(--text-base);
    margin: 0 0 0.625rem;
  }
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
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--text-muted);
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .ty {
    color: var(--gold);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .desc {
    color: var(--text-muted);
  }

  @media (max-width: 860px) {
    .ref {
      grid-template-columns: 1fr;
    }
  }
</style>
