<!--
  ui/FilterBadge.svelte - a removable badge: a label, an optional mono detail,
  and its own x button.

  Built on mimic-pill because mimic-ui has no removable badge yet; the knobs
  below give it the look the replacement picker's chips had. The x is a
  separate button so reading a label never risks removing it.
-->
<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  type Variant = 'default' | 'warning';

  let {
    label,
    detail,
    variant = 'default',
    removeLabel,
    onremove,
    class: className,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & {
    label: string;
    /** Shown after the label in mono, e.g. a source abbreviation. */
    detail?: string;
    variant?: Variant;
    /** Accessible name for the x button. */
    removeLabel: string;
    onremove: () => void;
  } = $props();
</script>

<span
  {...rest}
  class={[
    'mimic-pill',
    'filter-badge',
    variant === 'warning' && 'filter-badge-warning',
    className,
  ]}
>
  <span class="filter-badge-label">{label}</span>
  {#if detail}<span class="filter-badge-detail">{detail}</span>{/if}
  <button
    type="button"
    class="filter-badge-remove"
    aria-label={removeLabel}
    onclick={onremove}>&times;</button
  >
</span>

<style>
  /* ── Filter Badge - Base ───────────────────────────────────────────────── */
  .filter-badge {
    --mimic-pill-bg: var(--bg-hover);
    --mimic-pill-border: var(--border);
    --mimic-pill-text: var(--text-main);
    --mimic-pill-radius: var(--radius-sm);
    --mimic-pill-weight: var(--font-weight-normal);
    --mimic-pill-padding-block: var(--hm-space-0-5);
    --mimic-pill-padding-inline: 0.375rem var(--hm-space-0-5);
    --filter-badge-detail: var(--gold);

    gap: 0.25rem;
    max-inline-size: 100%;
  }

  .filter-badge-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .filter-badge-detail {
    flex-shrink: 0;
    color: var(--filter-badge-detail);
    font-family: var(--font-mono);
  }

  .filter-badge-remove {
    flex-shrink: 0;
    padding-block: 0;
    padding-inline: 0.25rem;
    border: none;
    background: none;
    color: var(--text-faint);
    font: inherit;
    font-size: var(--text-sm);
    line-height: 1;
    cursor: pointer;
  }

  /* ── Filter Badge - Variants ───────────────────────────────────────────── */
  .filter-badge-warning {
    --mimic-pill-border: var(--warn);
    --mimic-pill-text: var(--warn);
    --filter-badge-detail: currentcolor;
  }

  /* ── Filter Badge - States ─────────────────────────────────────────────── */
  .filter-badge-remove:hover {
    color: var(--danger);
  }

  .filter-badge-remove:focus-visible {
    outline: 1px solid var(--gold);
    outline-offset: 1px;
  }
</style>
