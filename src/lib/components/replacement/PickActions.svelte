<!--
  components/replacement/PickActions.svelte - the picker's header buttons:
  Cancel, then Swap / Clear / Save for the staging boxes.

  SAVE IS THE RULE, NOT THE ROUTE'S
    A build with an empty side throws (see buildManualRows), so the gate lives
    here with the buttons rather than being restated by every caller. `busy`
    covers the other reason Save can't run yet: the document behind it is
    still loading.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import type { PickedEntity } from '$lib/state/supersessions.svelte.ts';

  interface Props {
    newItems: PickedEntity[];
    replacedItems: PickedEntity[];
    /** True when the picker was entered by Edit, which makes Save able to remove. */
    editing: boolean;
    /**
     * Save is unavailable for a reason that isn't the boxes: the document
     * behind it has not been read. In flight or failed outright - either way
     * building against it would stage against an empty file.
     */
    busy: boolean;
    onCancel: () => void;
    onSwap: () => void;
    onClear: () => void;
    onSave: () => void;
  }

  let {
    newItems,
    replacedItems,
    editing,
    busy,
    onCancel,
    onSwap,
    onClear,
    onSave,
  }: Props = $props();

  const staged = $derived(newItems.length + replacedItems.length);
  const canSave = $derived(
    !busy && newItems.length > 0 && replacedItems.length > 0,
  );

  /**
   * Why Save is off, in the words of the thing that is missing. A disabled
   * button with no explanation is the picker's most likely dead end: both
   * boxes have to be filled from a tree that shows no sign of wanting two.
   */
  const saveTitle = $derived(
    busy
      ? // Deliberately not "still reading": a read that FAILED lands here too,
        // and the banner is the thing that says which.
        'Waiting on the mapping file - Save stays off until it has been read.'
      : !replacedItems.length
        ? 'Pick at least one item to replace - use "Replace this" below.'
        : !newItems.length
          ? 'Pick at least one item to keep - use "Keep this" below.'
          : editing
            ? 'Rewrites this mapping and returns. Nothing is written to disk until you Save on the Replace Content page.'
            : 'Stages the mapping and returns. Nothing is written to disk until you Save on the Replace Content page.',
  );
</script>

<div class="pick-actions">
  <Button
    title="Leave without staging anything - the chips are discarded"
    onclick={onCancel}>Cancel</Button
  >
  <Button
    disabled={!staged}
    title="Exchange the two lists - what you kept becomes what is replaced"
    onclick={onSwap}>Swap</Button
  >
  <Button disabled={!staged} onclick={onClear}>Clear</Button>
  <Button
    variant="primary"
    disabled={!canSave}
    title={saveTitle}
    onclick={onSave}>Save</Button
  >
</div>

<style>
  /* ── Pick Actions - Layout ─────────────────────────────────────────────── */
  .pick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
  }
</style>
