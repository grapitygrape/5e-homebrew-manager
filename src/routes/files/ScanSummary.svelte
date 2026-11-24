<!--
  One file's scan line: errors, warnings, clean objects, then content links.
  Shared by Manage files and Add a homebrew file so both read the same.
-->
<script lang="ts" module>
  import type { DocumentValidation } from '$lib/api';

  export type Scan = DocumentValidation['totals'] | { error: string };
</script>

<script lang="ts">
  import StatusText from '$lib/ui/StatusText.svelte';

  let { scan: s }: { scan: Scan } = $props();
</script>

{#if 'error' in s}
  <StatusText variant="error">Scan failed — {s.error}</StatusText>
{:else}
  <StatusText variant={s.errors ? 'error' : 'default'}
    >{s.errors} {s.errors === 1 ? 'error' : 'errors'}</StatusText
  >
  ·
  <StatusText variant={s.warnings ? 'warning' : 'default'}
    >{s.warnings}
    {s.warnings === 1 ? 'warning' : 'warnings'}</StatusText
  >
  ·
  <StatusText variant="ok">{s.clean} clean</StatusText> · {s.objects}
  objects
  {#if (s.brokenLinks ?? 0) + (s.linkWarnings ?? 0) > 0}
    <span
      class="links"
      title="Broken content links (inline tags, _copy, requires, prerequisites)"
    >
      <i class="fa-sharp-duotone fa-regular fa-link" aria-hidden="true"></i>
      <StatusText variant={s.brokenLinks ? 'error' : 'default'}
        >{s.brokenLinks ?? 0} broken {(s.brokenLinks ?? 0) === 1
          ? 'link'
          : 'links'}</StatusText
      >{#if s.linkWarnings}
        · <StatusText variant="warning"
          >{s.linkWarnings} link {s.linkWarnings === 1
            ? 'warning'
            : 'warnings'}</StatusText
        >{/if}
    </span>
  {:else}
    <StatusText class="links" variant="ok" title="All content links resolve"
      ><i class="fa-sharp-duotone fa-regular fa-link" aria-hidden="true"></i> links
      ok</StatusText
    >
  {/if}
{/if}

<style>
  .links {
    display: inline-block;
    margin-inline-start: 0.375rem;
  }
</style>
