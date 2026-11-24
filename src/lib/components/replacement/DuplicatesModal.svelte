<!--
  DuplicatesModal - "Duplicates" on Replace Content, after a Rescan.

  Lists homebrew that shares a name with official content of the same type
  but isn't mapped yet, so the site shows both copies. Add stages a mapping
  from each official copy to the brew; nothing is written until Save. The
  page passes only what is still unmapped, so an added row drops out here.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import SearchInput from '$lib/ui/SearchInput.svelte';
  import { propLabel } from '$lib/engine/blocklist';
  import { duplicateId, packUid } from '$lib/engine/supersession';
  import type { Duplicate } from '$lib/engine/supersession';
  import { formatNumber, plural } from '$lib/util';

  interface Props {
    duplicates: Duplicate[];
    onadd: (d: Duplicate) => void;
    ondismiss: (d: Duplicate) => void;
    onclose: () => void;
  }

  let { duplicates, onadd, ondismiss, onclose }: Props = $props();

  let query = $state('');
  const needle = $derived(query.trim().toLowerCase());

  const visible = $derived(
    needle
      ? duplicates.filter(
          (d) =>
            d.replacement.name.toLowerCase().includes(needle) ||
            d.replacement.source.toLowerCase().includes(needle) ||
            d.originals.some((o) => o.source.toLowerCase().includes(needle)),
        )
      : duplicates,
  );

  // A snapshot: adding shrinks `visible` underneath the loop.
  const addAll = () => {
    for (const d of [...visible]) onadd(d);
  };
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={onclose}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Duplicates">
  <header>
    <h2>Duplicates</h2>
    <button class="icon" onclick={onclose} aria-label="Close"
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  </header>
  <div class="toolbar">
    <SearchInput bind:value={query} placeholder="Filter by name or source." />
    <span>
      {formatNumber(visible.length)}
      {plural(visible.length, 'homebrew item', 'homebrew items')} share a name with
      official content and aren't mapped
    </span>
    {#if visible.length}
      <Button
        size="small"
        title="Stage a mapping for every row shown. Nothing is written until you Save."
        onclick={addAll}>Add all {formatNumber(visible.length)}</Button
      >
    {/if}
  </div>
  <div class="scroll">
    {#if visible.length}
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Homebrew</th>
            <th>Official copies it would replace</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as d (duplicateId(d))}
            <tr>
              <td>{propLabel(d.replacement.prop)}</td>
              <td>{packUid(d.replacement.name, d.replacement.source)}</td>
              <td>
                {#each d.originals as o (o.hash + o.source)}
                  <span class="original">{packUid(o.name, o.source)}</span>
                {/each}
              </td>
              <td class="actions">
                <Button
                  size="small"
                  variant="primary"
                  title="Redirect the official copies to this homebrew item"
                  onclick={() => onadd(d)}>Add</Button
                >
                <Button
                  size="small"
                  title="Hide this one until the app restarts"
                  onclick={() => ondismiss(d)}>Dismiss</Button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="muted">
        {duplicates.length
          ? 'Nothing matches that filter.'
          : 'No unmapped duplicates. Every homebrew item that shares a name with official content is mapped or dismissed.'}
      </p>
    {/if}
  </div>
  <footer>
    <Button onclick={onclose}>Close</Button>
  </footer>
</div>

<style>
  /* ── Duplicates modal - Frame ─────────────────────────────────────────────── */
  .scrim {
    position: fixed;
    inset: 0;
    background: hsl(0 0% 0% / 0.6);
    z-index: 40;
  }
  .modal {
    position: fixed;
    inset: 8vh 10vw;
    z-index: 41;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: 0 18px 60px hsl(0 0% 0% / 0.55);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    padding-block: 1rem 0.75rem;
    padding-inline: 1.25rem;
    border-block-end: 1px solid var(--border);
  }
  header h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-tight);
  }
  .icon {
    margin-inline-start: auto;
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: var(--text-lg);
    cursor: pointer;
    &:where(:hover, :focus-visible) {
      color: var(--text-main);
    }
  }
  footer {
    display: flex;
    justify-content: flex-end;
    padding-block: 0.75rem;
    padding-inline: 1.25rem;
    border-block-start: 1px solid var(--border);
  }

  /* ── Duplicates modal - Toolbar ───────────────────────────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-block: 0.75rem 0.5rem;
    padding-inline: 1.25rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
    & :global(.search-input) {
      flex: 0 1 20rem;
    }
    & :global(.button) {
      margin-inline-start: auto;
    }
  }

  /* ── Duplicates modal - Table ─────────────────────────────────────────────── */
  .scroll {
    flex: 1;
    overflow-y: auto;
    padding-block: 0 1.25rem;
    padding-inline: 1.25rem;
  }
  table {
    inline-size: 100%;
    border-collapse: collapse;
  }
  th {
    position: sticky;
    inset-block-start: 0;
    background: var(--bg-panel);
    text-align: start;
    padding-block: 0.5rem;
    padding-inline: 0.625rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--text-faint);
    border-block-end: 1px solid var(--border);
  }
  td {
    padding-block: 0.5rem;
    padding-inline: 0.625rem;
    border-block-end: 1px solid var(--border);
    vertical-align: top;
  }
  .original {
    display: block;
  }
  .actions {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }
  .muted {
    margin: 0;
    padding-block: 1rem;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
