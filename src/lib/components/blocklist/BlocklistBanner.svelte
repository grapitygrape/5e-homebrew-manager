<script lang="ts">
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { formatNumber, plural } from '$lib/util';
  import type { BlocklistBannerState } from './blocklist-model.ts';

  let {
    banner = null,
    collapsed = [],
    unmatchedCount = 0,
    ondismiss,
  }: {
    banner?: BlocklistBannerState | null;
    collapsed?: string[];
    unmatchedCount?: number;
    ondismiss?: () => void;
  } = $props();
</script>

{#if banner}
  <Banner tone={banner.tone} text={banner.text} {ondismiss}>
    {#if banner.action && unmatchedCount}
      <Button size="small" onclick={banner.action.run}>
        {banner.action.label} ({formatNumber(unmatchedCount)})
      </Button>
    {/if}
  </Banner>
{/if}

{#if collapsed.length}
  <details class="dropped">
    <summary>
      {formatNumber(collapsed.length)} dropped {plural(
        collapsed.length,
        'duplicate',
        'duplicates',
      )}
    </summary>
    <ul>
      {#each collapsed as line, i (i)}<li>{line}</li>{/each}
    </ul>
  </details>
{/if}

<style>
  .dropped {
    margin-bottom: 0.75rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .dropped summary {
    cursor: pointer;
    color: var(--warn);
  }
  .dropped ul {
    margin: 0.375rem 0 0;
    padding-inline-start: 1.25rem;
  }
  .dropped li {
    margin-bottom: 0.25rem;
  }
</style>
