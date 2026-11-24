<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Snippet } from 'svelte';

  type Variant = 'default' | 'positive' | 'danger' | 'warning';

  // The default badge is the manager's own neutral, not a mimic tone.
  const TONES: Record<Variant, string> = {
    default: 'badge-neutral',
    positive: 'mimic-tone-success',
    warning: 'mimic-tone-warning',
    danger: 'mimic-tone-error',
  };

  let {
    variant = 'default',
    prefix,
    suffix,
    children,
    class: className,
    ...rest
  }: Omit<HTMLAttributes<HTMLSpanElement>, 'prefix'> & {
    variant?: Variant;
    prefix?: string | number;
    suffix?: string;
    children?: Snippet;
  } = $props();
</script>

<span {...rest} class={['mimic-pill', 'badge', TONES[variant], className]}>
  {#if prefix != null && prefix !== ''}
    <span class="mimic-pill-count">{prefix}</span>
  {/if}
  {#if children}
    {@render children?.()}
  {/if}
  {#if suffix}
    <span class="badge-suffix">{suffix}</span>
  {/if}
</span>

<style>
  /* ── Badge - Manager Skin ──────────────────────────────────────────────────── */
  .badge {
    --mimic-pill-radius: var(--space-1);
    --mimic-pill-padding-block: var(--hm-space-0-5);
    --mimic-pill-padding-inline: var(--space-2);
  }

  .badge-neutral {
    --mimic-pill-bg: var(--bg-elevated);
    --mimic-pill-border: var(--border);
    --mimic-pill-text: var(--text-muted);

    .mimic-pill-count {
      color: var(--text-main);
    }
  }

  .badge-suffix {
    font-weight: var(--font-weight-medium);
  }
</style>
