<!--
  BlockedFilterMenu — multi-option filter dropdown for the Sources pane on
  Choose Content, matching the visual style of the adjacent SelectInput.
-->
<script lang="ts">
  let {
    hideBlocked = $bindable(false),
    showBlockedParentAllowed = $bindable(false),
    loading = false,
  }: {
    hideBlocked?: boolean;
    showBlockedParentAllowed?: boolean;
    loading?: boolean;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  const activeCount = $derived(
    (hideBlocked ? 1 : 0) + (showBlockedParentAllowed ? 1 : 0),
  );

  function onWindowClick(ev: MouseEvent) {
    if (!open || !root) return;
    if (!root.contains(ev.target as Node)) open = false;
  }

  function onKeydown(ev: KeyboardEvent) {
    if (open && ev.key === 'Escape') {
      ev.preventDefault();
      open = false;
    }
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="filter-menu" bind:this={root}>
  <button
    type="button"
    class="text-input trigger"
    class:active={activeCount > 0}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Hide blocked filter"
    onclick={() => (open = !open)}
  >
    <span class="label" class:placeholder={activeCount === 0}>
      Hide blocked
    </span>
    {#if activeCount > 0}
      <span class="count">{activeCount}</span>
    {/if}
    <i
      class="fa-sharp-duotone fa-regular fa-chevron-down chev"
      class:open
      aria-hidden="true"
    ></i>
  </button>

  {#if open}
    <div class="menu" role="menu" aria-label="Hide blocked options">
      <label
        class="option"
        title="Hide anything already covered by a blocklist rule"
      >
        <input type="checkbox" bind:checked={hideBlocked} />
        <span>Hide all blocked content</span>
      </label>
      <label
        class="option"
        title="Show only allowed content whose parent (class, base race, base item, item group, deck, or summoning spell) is blocked"
      >
        <input type="checkbox" bind:checked={showBlockedParentAllowed} />
        <span>
          Show allowed content with blocked parents{#if loading}…{/if}
        </span>
      </label>
    </div>
  {/if}
</div>

<style>
  @import '../../ui/field-input.css';

  .filter-menu {
    position: relative;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    width: auto;
    white-space: nowrap;
    cursor: pointer;
  }

  .trigger.active {
    border-color: var(--gold);
  }

  .label.placeholder {
    color: var(--text-muted);
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 1.1rem;
    padding-inline: 0.25rem;
    border-radius: 999px;
    background: hsl(38 56% 56% / 0.2);
    color: var(--gold-bright);
    font-size: var(--text-xs);
    line-height: 1.25;
  }

  .chev {
    font-size: var(--hm-text-2xs);
    color: var(--text-muted);
    transition: transform 0.12s ease;
  }

  .chev.open {
    transform: rotate(180deg);
  }

  .menu {
    position: absolute;
    inset-block-start: calc(100% + 0.25rem);
    inset-inline-end: 0;
    z-index: 20;
    min-inline-size: max-content;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.375rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    box-shadow: 0 10px 28px hsl(0 0% 0% / 0.45);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--text-main);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }

  .option:hover {
    background: var(--bg-hover);
  }
</style>
