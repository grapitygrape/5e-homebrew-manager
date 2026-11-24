<!--
  JsonValidatorPanel — paste-to-validate + live converted preview panel shared
  by /guides and /reference. Runs purely client-side via engine.validateEntity
  and engine.translateEntity.
-->
<script lang="ts">
  import type { EntitySchema } from '$lib/engine/audit';
  import { errorText, escapeHtml } from '$lib/util';
  import {
    buildValidationResult,
    renderEntityPreview,
    sampleValidatorJson,
    validationSummaryText,
    type ValidatorResult,
  } from '$lib/validate-json';
  import Button from '$lib/ui/Button.svelte';
  import TextareaInput from '$lib/ui/TextareaInput.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  let {
    schema,
    input = $bindable(''),
    showInsertSample = true,
  }: {
    schema: EntitySchema | null;
    input?: string;
    showInsertSample?: boolean;
  } = $props();

  const result = $derived.by(() => buildValidationResult(input, schema));

  const previewHtml = $derived.by((): string => {
    if (result.kind !== 'done' || !schema) return '';
    try {
      return renderEntityPreview(
        schema.arrayProp ?? schema.entityType,
        result.first,
        schema.entityType,
      );
    } catch (e) {
      return `<div class="status-text-error">Preview error: ${escapeHtml(errorText(e))}</div>`;
    }
  });

  function summaryText(r: Extract<ValidatorResult, { kind: 'done' }>): string {
    return validationSummaryText(r, schema?.label ?? 'entity');
  }

  function insertSample() {
    input = sampleValidatorJson(schema);
  }
</script>

<div class="validator">
  <div class="col">
    <div class="col-head">
      <span>Paste <strong>{schema?.label ?? 'entity'}</strong> JSON</span>
      <span class="col-actions">
        {#if showInsertSample}
          <Button onclick={insertSample}>Insert example</Button>
        {/if}
        <Button size={showInsertSample ? undefined : 'small'} onclick={() => (input = '')}>
          Clear
        </Button>
      </span>
    </div>
    <TextareaInput
      mono
      bind:value={input}
      spellcheck="false"
      placeholder="Paste a single entity, an array, or a full homebrew file."
    />
    <div class="results">
      {#if result.kind === 'empty'}
        <EmptyState>
          Paste JSON above to validate it against the current schema.
        </EmptyState>
      {:else if result.kind === 'noschema'}
        <div class="line warn">
          Schema unavailable — configure the schema folder, or run the server.
        </div>
      {:else if result.kind === 'badjson'}
        <StatusText as="div" class="summary" variant="error"
          >Invalid JSON</StatusText
        >
        <div class="line err">{result.message}</div>
      {:else if result.kind === 'none'}
        <div class="line warn">No entities found to validate.</div>
      {:else if result.kind === 'done'}
        <StatusText
          as="div"
          class="summary"
          variant={result.errs ? 'error' : result.warns ? 'warning' : 'ok'}
        >
          {summaryText(result)}
        </StatusText>
        {#each result.lines as ln, i (i)}
          <div class="line {ln.cls}">{@html ln.html}</div>
        {/each}
      {/if}
    </div>
  </div>
  <div class="col">
    <div class="col-head">Converted preview</div>
    <div class="preview">
      {#if previewHtml}{@html previewHtml}{:else}<EmptyState>
          A live preview of the converted content appears here.
        </EmptyState>{/if}
    </div>
  </div>
</div>

<style>
  .validator {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg-panel);
  }
  .col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .col-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }
  .col-actions {
    display: flex;
    gap: 0.375rem;
  }
  .results {
    margin-top: 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .validator :global(.summary) {
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-sm);
    padding: 0.25rem 0;
  }
  .line {
    font-size: var(--text-sm);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background: var(--bg-elevated);
  }
  .line.err {
    color: var(--danger);
  }
  .line.warn {
    color: var(--warn);
  }
  .line.name {
    background: transparent;
    color: var(--text-muted);
  }
  .preview {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0.75rem;
    background: var(--bg-app);
    min-height: 160px;
    overflow: auto;
  }

  @media (max-width: 860px) {
    .validator {
      grid-template-columns: 1fr;
    }
  }
</style>
