<script module lang="ts">
  export type BannerTone = 'ok' | 'warn' | 'error';

  export interface BannerState {
    tone: BannerTone;
    text: string;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  const TONES: Record<BannerTone, string> = {
    ok: 'mimic-tone-success',
    warn: 'mimic-tone-warning',
    error: 'mimic-tone-error',
  };

  let {
    tone,
    text,
    ondismiss,
    children,
    class: className,
  }: {
    tone: BannerTone;
    text: string;
    ondismiss?: () => void;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<div class={['mimic-banner', 'banner', TONES[tone], className]}>
  <span class="mimic-banner-text">{text}</span>
  {#if children}
    <div class="mimic-banner-actions">{@render children()}</div>
  {/if}
  {#if ondismiss}
    <button
      type="button"
      class="mimic-banner-dismiss"
      aria-label="Dismiss"
      onclick={ondismiss}
      ><i class="fa-sharp-duotone fa-regular fa-xmark" aria-hidden="true"
      ></i></button
    >
  {/if}
</div>

<style>
  /* ── Banner - Manager Skin ─────────────────────────────────────────────────── */
  /* Outlined: no fill, the border in the full tone color. */
  .banner {
    --mimic-banner-bg: transparent;
    --mimic-banner-border: var(--mimic-tone);
    --mimic-banner-padding-block: var(--space-2);
    --mimic-banner-padding-inline: var(--space-3);
    --mimic-banner-radius: var(--radius-sm);

    margin-block-end: var(--space-3);
  }

  .mimic-banner-dismiss {
    font-size: var(--text-lg);
  }
</style>
