<!--
  ResolvedPanel — the entity the site will actually show, after `_copy`,
  `_mod`, `_templates`, and `_versions`, with an explanation of how it got
  there. Backed by POST /api/resolve (engine/merge/copy-applier — a faithful
  port of the site's copyApplier), so "load it into the site and squint" is no
  longer the debugging loop.

  Views: Result (final JSON), Rendered (client-side via engine.translateEntity),
  and What happened (the trace: failed mods first, then mods, dropped/deleted
  props, inherited props). Versions list below, each expandable.
-->
<script lang="ts">
  import type { CopyTrace, CopyChainLink, TraceStep } from '$lib/engine/merge';
  import { resolveEntity } from '$lib/api';
  import { renderEntityPreview } from '$lib/validate-json';
  import { errorText } from '$lib/util';
  import StatusText from '$lib/ui/StatusText.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';

  let {
    type,
    entityIdx,
    doc,
    file,
  }: {
    type: string;
    entityIdx: number;
    doc: Record<string, unknown>;
    file?: string;
  } = $props();

  interface Resolved {
    resolved: Record<string, unknown>;
    hasCopy: boolean;
    chain: CopyChainLink[];
    trace: CopyTrace;
    versions: { entity: Record<string, unknown>; trace: CopyTrace }[];
  }

  let result = $state<Resolved | null>(null);
  let error = $state('');
  let loading = $state(false);
  let view = $state<'json' | 'rendered' | 'trace'>('trace');
  let seq = 0;

  $effect(() => {
    const request = { type, entityIdx, doc, file };
    const mine = ++seq;
    loading = true;
    error = '';
    void (async () => {
      try {
        const next = await resolveEntity(request);
        if (mine === seq) result = next;
      } catch (e) {
        if (mine !== seq) return;
        error = errorText(e);
        result = null;
      } finally {
        if (mine === seq) loading = false;
      }
    })();
  });

  // Rendered view translates purely client-side when active.
  const html = $derived.by(() => {
    if (view !== 'rendered' || !result) return '';
    try {
      return renderEntityPreview(type, result.resolved);
    } catch {
      return '';
    }
  });

  const groups = $derived.by(() => {
    const steps = result?.trace.steps ?? [];
    const by = (pred: (s: TraceStep) => boolean) => steps.filter(pred);
    return {
      failed: by((s) => !s.ok),
      mods: by(
        (s) =>
          s.ok &&
          (s.kind === 'mod' || s.kind === 'template' || s.kind === 'root'),
      ),
      dropped: by((s) => s.kind === 'drop' || s.kind === 'delete'),
      inherited: by((s) => s.kind === 'inherit').map((s) => s.prop),
      variables: by((s) => s.kind === 'variable'),
    };
  });

  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
</script>

<div class="resolved">
  {#if error}
    <StatusText as="div" variant="error">Resolve failed — {error}</StatusText>
  {:else if !result}
    <EmptyState>{loading ? 'Resolving…' : 'Select an object.'}</EmptyState>
  {:else}
    {#if !result.hasCopy && !result.versions.length}
      <p class="note">
        No <code>_copy</code> or <code>_versions</code> — this object renders exactly
        as written.
      </p>
    {/if}

    {#if result.chain.length}
      <div class="chain">
        <span class="lbl">Copies</span>
        {#each result.chain as link, i (i)}
          {#if i}<span class="arrow">←</span>{/if}
          <span class="link"
            >{link.name} <span class="src">({link.source})</span>
            <span class="origin"
              >{link.origin === 'official'
                ? 'official'
                : (link.origin ?? '')}</span
            ></span
          >
        {/each}
      </div>
    {/if}

    {#each result.trace.errors as e, i (i)}
      <StatusText as="div" variant="error" class="line">{e}</StatusText>
    {/each}
    {#each result.trace.warnings as w, i (i)}
      <StatusText as="div" variant="warning" class="line">{w}</StatusText>
    {/each}

    {#if result.hasCopy}
      <div class="views" role="tablist">
        {#each [['trace', 'What happened'], ['json', 'Result'], ['rendered', 'Rendered']] as [v, label] (v)}
          <button
            class:on={view === v}
            role="tab"
            aria-selected={view === v}
            onclick={() => (view = v as typeof view)}>{label}</button
          >
        {/each}
      </div>

      {#if view === 'trace'}
        {#if groups.failed.length}
          <h4 class="err">Failed</h4>
          <ul>
            {#each groups.failed as s, i (i)}
              <li class="err"><code>{s.prop}</code> {s.detail}</li>
            {/each}
          </ul>
        {/if}
        {#if groups.mods.length}
          <h4>Modifications, in order</h4>
          <ul>
            {#each groups.mods as s, i (i)}
              <li><code>{s.prop || '—'}</code> {s.detail}</li>
            {/each}
          </ul>
        {/if}
        {#if groups.dropped.length}
          <h4>Not carried over</h4>
          <ul>
            {#each groups.dropped as s, i (i)}
              <li><code>{s.prop}</code> {s.detail}</li>
            {/each}
          </ul>
        {/if}
        {#if groups.variables.length}
          <h4>Variables</h4>
          <ul>
            {#each groups.variables as s, i (i)}<li>{s.detail}</li>{/each}
          </ul>
        {/if}
        {#if groups.inherited.length}
          <h4>Inherited unchanged</h4>
          <p class="props">
            {#each groups.inherited as p, i (i)}<code>{p}</code>{' '}{/each}
          </p>
        {/if}
      {:else if view === 'json'}
        <pre>{pretty(result.resolved)}</pre>
      {:else}
        <div class="preview">
          {#if html}{@html html}{:else}<span class="note">No preview available.</span>{/if}
        </div>
      {/if}
    {/if}

    {#if result.versions.length}
      <h4>Versions ({result.versions.length})</h4>
      {#each result.versions as v, i (i)}
        <details class="version">
          <summary>
            {v.entity.name}
            {#if v.trace.errors.length}<StatusText variant="error"
                >· {v.trace.errors.length} failed</StatusText
              >{/if}
          </summary>
          {#each v.trace.errors as e, j (j)}
            <StatusText as="div" variant="error" class="line">{e}</StatusText>
          {/each}
          <pre>{pretty(v.entity)}</pre>
        </details>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .resolved {
    padding: 0.5rem 0.875rem 1rem;
    font-size: var(--text-xs);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .note {
    color: var(--text-muted);
    margin: 0;
  }
  .chain {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.375rem;
  }
  .lbl,
  .origin,
  .src {
    color: var(--text-faint);
  }
  .origin {
    font-size: var(--hm-text-2xs);
  }
  .arrow {
    color: var(--text-faint);
  }
  .views {
    display: flex;
    gap: 0.25rem;
  }
  .views button {
    flex: 1;
    font: inherit;
    padding: 0.25rem 0.5rem;
    color: var(--text-muted);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .views button.on {
    color: var(--text-main);
    background: var(--bg-elevated);
    border-color: var(--gold);
  }
  h4 {
    margin: 0.375rem 0 0;
    font-size: var(--hm-text-2xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--text-faint);
  }
  h4.err,
  li.err {
    color: var(--danger);
  }
  ul {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow-wrap: anywhere;
  }
  .props {
    margin: 0;
    line-height: 1.8;
  }
  pre {
    margin: 0;
    padding: 0.5rem;
    background: var(--bg-sidebar);
    border-radius: var(--radius-sm);
    overflow: auto;
    max-height: 60vh;
    font-size: var(--hm-text-2xs);
  }
  .preview {
    font-size: var(--text-sm);
  }
  .version summary {
    cursor: pointer;
  }
  :global(.resolved .line) {
    overflow-wrap: anywhere;
  }
</style>
