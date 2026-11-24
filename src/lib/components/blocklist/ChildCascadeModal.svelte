<!--
  ChildCascadeModal — confirmation prompt when blocking or unblocking a parent
  entity (Class, Race, Base Item, Item Group, Deck, or summoning Spell) affects
  structural children (subclasses, subraces/race variants, derived items, cards,
  or summoned creatures).
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import { describeChildSummary, propLabel } from '$lib/engine/blocklist';
  import { formatNumber } from '$lib/util';
  import type { CascadeChoice, CascadePrompt } from './blocklist-model.ts';

  interface Props extends CascadePrompt {
    onchoose: (choice: CascadeChoice) => void;
  }

  let { mode, parentLabel, children, onchoose }: Props = $props();
  const oncancel = () => onchoose('cancel');

  const summary = $derived(describeChildSummary(children));
  const hasMultipleTypes = $derived(
    new Set(children.map((c) => c.prop)).size > 1,
  );
  const singular = $derived(children.length === 1);
  const totalCount = $derived(formatNumber(1 + children.length));

  function onKeydown(ev: KeyboardEvent) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      oncancel();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="scrim" onclick={oncancel}></div>
<div
  class="modal"
  role="dialog"
  aria-modal="true"
  aria-labelledby="child-cascade-title"
>
  <header>
    <h2 id="child-cascade-title">
      {mode === 'block'
        ? 'Also block related content?'
        : 'Also unblock related content?'}
    </h2>
    <button class="icon" onclick={oncancel} aria-label="Close">
      <i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"></i>
    </button>
  </header>

  <div class="body">
    <p class="lead">
      {#if mode === 'block'}
        Blocking <strong>{parentLabel}</strong> will also remove
        <strong>{summary}</strong> from your game:
      {:else}
        <strong>{parentLabel}</strong> has <strong>{summary}</strong> that
        {singular ? 'is' : 'are'} still blocked. Remove
        {singular ? 'it' : 'them'} from the blocklist?
      {/if}
    </p>

    <div class="scroll">
      <ul class="children">
        {#each children as child (`${child.prop}|${child.hash}|${child.source}`)}
          <li>
            <span class="name">{child.name}</span>
            {#if hasMultipleTypes}
              <span class="type">{propLabel(child.prop)}</span>
            {/if}
            <SourceTag source={child.source} class="src" />
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <footer>
    <Button onclick={oncancel}>Cancel</Button>
    <Button onclick={() => onchoose('parent')}>
      {mode === 'block' ? 'Block parent only' : 'Keep children blocked'}
    </Button>
    <Button variant="primary" onclick={() => onchoose('all')}>
      {mode === 'block'
        ? `Block all (${totalCount})`
        : `Remove all (${totalCount})`}
    </Button>
  </footer>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: hsl(0 0% 0% / 0.6);
    z-index: 40;
  }

  .modal {
    position: fixed;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    transform: translate(-50%, -50%);
    inline-size: min(38rem, calc(100vw - 2rem));
    max-block-size: 80vh;
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

  .body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-block-size: 0;
    padding-block: 1rem;
    padding-inline: 1.25rem;
  }

  .lead {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-main);
    line-height: 1.45;
  }

  .scroll {
    flex: 1;
    min-block-size: 0;
    max-block-size: 46vh;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-inset, var(--bg-app));
  }

  .children {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .children li {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding-block: 0.45rem;
    padding-inline: 0.75rem;
    font-size: var(--text-sm);
    border-block-end: 1px solid var(--border);
  }

  .children li:last-child {
    border-block-end: none;
  }

  .name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .type {
    font-size: var(--text-xs);
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .children :global(.src) {
    flex-shrink: 0;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding-block: 0.75rem;
    padding-inline: 1.25rem;
    border-block-start: 1px solid var(--border);
  }
</style>
