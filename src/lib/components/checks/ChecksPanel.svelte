<!--
  ChecksPanel — submission lint + collisions for the document in the Parser.
  POSTs the editor text to /api/lint (so formatting checks see the real
  text), with the file name used for the repo's naming rules. The name comes
  from ?file= when the Parser was opened from the Files view, and is editable
  for pasted content.
-->
<script lang="ts">
  import type { LintReport, Collision } from '$lib/engine/audit';
  import { lintText } from '$lib/api';
  import CheckIssueList from './CheckIssueList.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';

  let { raw, file = '' }: { raw: string; file?: string } = $props();

  let name = $state('');
  $effect.pre(() => {
    name = file || 'Author; Title.json';
  });

  let result = $state<{ lint: LintReport; collisions: Collision[] } | null>(
    null,
  );
  let error = $state('');
  let seq = 0;

  $effect(() => {
    const file = name;
    const text = raw;
    const mine = ++seq;
    const t = setTimeout(async () => {
      try {
        const next = await lintText(file, text);
        if (mine !== seq) return;
        result = next;
        error = '';
      } catch (e) {
        if (mine === seq) error = (e as Error).message;
      }
    }, 250);
    return () => clearTimeout(t);
  });
</script>

<div class="checks-panel">
  <label class="fname">
    File name
    <TextInput bind:value={name} aria-label="File name to lint against" />
  </label>
  {#if error}
    <StatusText as="div" variant="error">Lint failed — {error}</StatusText>
  {:else if result}
    <div class="sum">
      <StatusText variant={result.lint.totals.errors ? 'error' : 'ok'}
        >{result.lint.totals.errors} CI
        {result.lint.totals.errors === 1 ? 'failure' : 'failures'}</StatusText
      >
      ·
      <StatusText variant={result.lint.totals.warnings ? 'warning' : 'default'}
        >{result.lint.totals.warnings}
        {result.lint.totals.warnings === 1 ? 'warning' : 'warnings'}</StatusText
      >
      ·
      <StatusText variant={result.collisions.length ? 'error' : 'ok'}
        >{result.collisions.length}
        {result.collisions.length === 1
          ? 'collision'
          : 'collisions'}</StatusText
      >
    </div>
    <CheckIssueList
      issues={result.lint.issues}
      collisions={result.collisions}
      showFiles
    />
  {/if}
</div>

<style>
  .checks-panel {
    padding: 0.5rem 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    font-size: var(--text-xs);
  }
  .fname {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text-muted);
  }
  .sum {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
</style>
