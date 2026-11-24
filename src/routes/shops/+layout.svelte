<!--
  Shops - a subtab bar over each shop tool. Add a tab = add a route folder
  under shops/ and an entry in `tabs`.
-->
<script lang="ts">
  import { page } from '$app/state';

  let { children } = $props();

  const tabs = [
    { href: '/shops/lists', label: 'Lists' },
    { href: '/shops/prices', label: 'Prices' },
  ];
</script>

<nav class="shop-tabs" aria-label="Shops">
  {#each tabs as tab (tab.href)}
    <a
      class="shop-tab"
      href={tab.href}
      aria-current={page.url.pathname.startsWith(tab.href) ? 'page' : undefined}
      >{tab.label}</a
    >
  {/each}
</nav>

{@render children()}

<style>
  /* ── Shops - Subtabs ──────────────────────────────────────────────────── */
  .shop-tabs {
    display: flex;
    gap: 0.25rem;
    padding-block: 0.75rem 0;
    padding-inline: 2rem;
    border-block-end: 1px solid var(--border);
  }

  .shop-tab {
    padding-block: 0.5rem;
    padding-inline: 0.875rem;
    border-block-end: 2px solid transparent;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-decoration: none;

    &:hover {
      color: var(--text-main);
    }

    &[aria-current='page'] {
      border-block-end-color: var(--gold);
      color: var(--text-main);
    }
  }
</style>
