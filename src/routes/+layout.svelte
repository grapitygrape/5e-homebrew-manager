<!--
  +layout.svelte - the app shell (Svelte 5 runes).

  INTENT: a quiet, dark developer-tool frame. Sidebar nav + content slot. The
  chrome disappears; each route fills <main>. Active-route highlight uses
  $app/state (the modern, store-free page object). Add a view = add a route
  folder + one nav entry below. Collapse to an icon rail is a class on <html>
  so first paint matches localStorage (see the boot script in app.html).

  SETUP GATE: the desktop app goes to /setup until setup has been finished
  once, and /setup renders without the shell.

  LOADING: a first visit to a view waits for its data before the route
  changes, so the nav item it's heading for spins meanwhile. A revisit draws
  remembered data at once (state/page-cache) and the bar along the top of
  <main> says it's being re-read.
-->
<script lang="ts">
  // mimic-ui first: its layers sit under app.css and every component style.
  import '$lib/ui/mimic/mimic-tokens.css';
  import '$lib/ui/mimic/mimic-components.css';
  import '../app.css';
  import { onMount } from 'svelte';
  import { navigating, page } from '$app/state';
  import { afterNavigate, goto } from '$app/navigation';
  import {
    getCapabilities,
    isSetupCompleted,
    loadAppFonts,
    useSiteIcons,
  } from '$lib/api';
  import Logo from '$lib/Logo.svelte';
  import RunCard from '$lib/components/RunCard.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import { deployRun } from '$lib/state/deploy-run.svelte.ts';
  import {
    indexMismatch,
    refreshIndexMismatch,
  } from '$lib/state/index-mismatch.svelte.ts';
  import { cacheActivity } from '$lib/state/page-cache.svelte.ts';
  import { startFoundryBridge } from '$lib/state/foundry.svelte.ts';
  import {
    isTauri,
    getLocalServerStatus,
    openExternalTarget,
    openSiteBrowser,
    type LocalServerStatus,
  } from '$lib/tauri-bridge';

  let { children } = $props();

  const STORAGE_KEY = 'hbm-sidebar-collapsed';

  // `divider` draws a rule above the item to start a new group.
  const nav: {
    href: string;
    label: string;
    icon: string;
    divider?: boolean;
  }[] = [
    { href: '/', label: 'Dashboard', icon: 'fa-gauge-high' },
    { href: '/blocklist', label: 'Manage Sources & Content', icon: 'fa-books' },
    { href: '/files', label: 'Homebrew Files', icon: 'fa-files' },
    {
      href: '/replacement',
      label: 'Replace Content',
      icon: 'fa-swap',
    },
    { href: '/shops', label: 'Shops', icon: 'fa-store' },
    {
      href: '/guides',
      label: 'Conversion Guides',
      icon: 'fa-book-open-cover',
      divider: true
    },
    { href: '/reference', label: 'Schema Reference', icon: 'fa-list-tree' },
    { href: '/parser', label: 'Homebrew Parser', icon: 'fa-brackets-curly' },
    { href: '/deploy', label: 'Deploy Site', icon: 'fa-rocket-launch', divider: true },
    {
      href: '/customize',
      label: 'Customize Site',
      icon: 'fa-palette',
      divider: true,
    },
    {
      href: '/sources',
      label: 'Source Data',
      icon: 'fa-code-branch',
    },
    { href: '/settings', label: 'Settings', icon: 'fa-gear' },
  ];

  let collapsed = $state(false);

  function navTitle(href: string, label: string): string {
    const n = href === '/files' ? indexMismatch.count : 0;
    return n ? `${label} (${n} not matching index.json)` : label;
  }
  // In the desktop app the shell waits for the setup check, so it never flashes.
  let ready = $state(!isTauri());
  let serverStatus = $state<LocalServerStatus | null>(null);
  let siteBrowserError = $state<string | null>(null);

  function launchSiteBrowser() {
    siteBrowserError = null;
    openSiteBrowser().catch((err: Error) => (siteBrowserError = err.message));
  }

  // Files the homebrew folder and its index.json disagree on: checked at
  // startup, after each run (Prepare can reveal one) and on navigation.
  $effect(() => {
    if (!deployRun.busy) void refreshIndexMismatch();
  });
  afterNavigate(() => void refreshIndexMismatch());

  onMount(() => {
    collapsed =
      document.documentElement.classList.contains('sidebar-collapsed');
    // Modesto lives in the data folder; until it loads, headings use Nodesto.
    void loadAppFonts();
    // Free icons until the Tools source checkout supplies its Pro ones.
    void useSiteIcons();
    // In a plain browser tab there is no Rust server to report on.
    if (isTauri()) {
      isSetupCompleted()
        .then((done) =>
          done || page.url.pathname === '/setup' ? null : goto('/setup'),
        )
        .catch(() => null)
        .finally(() => (ready = true));
      getLocalServerStatus()
        .then((status) => (serverStatus = status))
        .catch(() => (serverStatus = null));
    } else {
      void getCapabilities()
        .then((caps) => {
          if (caps.localSite) {
            getLocalServerStatus()
              .then((status) => (serverStatus = status))
              .catch(() => (serverStatus = null));
          }
          if (caps.containerMode) {
            isSetupCompleted()
              .then((done) =>
                done || page.url.pathname === '/setup' ? null : goto('/setup'),
              )
              .catch(() => null);
          }
        })
        .catch(() => null);
    }
    // Single Foundry bridge polling loop: keeps every view's status fresh and
    // auto-syncs mappings and Neptunium settings to newly connected worlds.
    return startFoundryBridge();
  });

  const matches = (href: string, pathname: string): boolean =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const isActive = (href: string): boolean => matches(href, page.url.pathname);

  // Only once the target differs from here; a reload of this view isn't a trip.
  const isLoading = (href: string): boolean => {
    const to = navigating.to?.url.pathname;
    return !!to && matches(href, to) && !isActive(href);
  };

  const busy = $derived(!!navigating.to || cacheActivity.refreshing);

  function toggleCollapsed() {
    collapsed = !collapsed;
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }
</script>

{#if page.url.pathname === '/setup'}
  <main>
    {@render children()}
  </main>
{:else if ready}
  <div class="shell">
    <aside class="sidebar">
      <nav>
        {#each nav as item (item.href)}
          {#if item.divider}
            <div class="nav-divider" role="separator"></div>
          {/if}
          <a
            href={item.href}
            class="nav-item"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? 'page' : undefined}
            title={collapsed ? navTitle(item.href, item.label) : undefined}
          >
            <i
              class={[
                'nav-glyph fa-sharp-duotone fa-regular',
                isLoading(item.href) ? 'fa-spinner-third fa-spin' : item.icon,
              ]}
              aria-hidden="true"
            ></i>
            <span>{item.label}</span>
            {#if item.href === '/files' && indexMismatch.count}
              <Badge
                variant="warning"
                class="nav-badge"
                title="Files that don't match index.json"
                >{indexMismatch.count}</Badge
              >
            {/if}
          </a>
        {/each}
        {#if isTauri()}
          <button
            type="button"
            class="nav-item nav-item-button"
            title={siteBrowserError ?? (collapsed ? 'Site Browser' : undefined)}
            onclick={launchSiteBrowser}
          >
            <i
              class="nav-glyph fa-sharp-duotone fa-regular fa-browser"
              aria-hidden="true"
            ></i>
            <span>Site Browser</span>
          </button>
          {#if siteBrowserError}
            <p class="nav-error" role="alert">{siteBrowserError}</p>
          {/if}
        {/if}
      </nav>

      <div class="sidebar-bottom">
        <RunCard />
        <div class="sidebar-foot">
          <button
            type="button"
            class="collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onclick={toggleCollapsed}
          >
            <i
              class="collapse-glyph collapse-glyph-in fa-sharp-duotone fa-regular fa-chevrons-left"
              aria-hidden="true"
            ></i>
            <i
              class="collapse-glyph collapse-glyph-out fa-sharp-duotone fa-regular fa-chevrons-right"
              aria-hidden="true"
            ></i>
          </button>
          {#if serverStatus}
            <button
              type="button"
              class="foot-status foot-status-server"
              class:foot-status-down={!serverStatus.running}
              title={serverStatus.running
                ? `Open ${serverStatus.url}`
                : (serverStatus.error ?? 'Local 5e server is not running')}
              onclick={() => serverStatus && openExternalTarget(serverStatus.url)}
            >
              <span class="dot"></span> 5e Server :{serverStatus.port}
            </button>
          {:else}
            <span class="foot-status">
              <span class="dot"></span> Local workspace
            </span>
          {/if}
        </div>
      </div>
    </aside>

    <main aria-busy={busy}>
      {#if busy}
        <div class="load-bar" role="presentation"></div>
      {/if}
      {@render children()}
    </main>
  </div>
{/if}

<style>
  .sidebar {
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding-block: var(--space-4);
    padding-inline: var(--space-3);
    gap: 1.25rem;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.25rem 0.375rem;
  }
  .brand-mark {
    color: #fff;
    width: 2.5rem;
    height: 2.5rem;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .brand-mark :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .brand-text {
    display: flex;
    flex-direction: column;
    font-size: var(--text-2xl);
    font-family: var(--font-display);
    line-height: var(--line-height-display);
    white-space: nowrap;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.625rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .nav-divider {
    block-size: 1px;
    flex-shrink: 0;
    margin-block: var(--hm-space-0-5);
    background: linear-gradient(
      to right,
      transparent 0%,
      var(--border-strong) 45%,
      var(--border-strong) 55%,
      transparent 100%
    );
  }
  .nav-item span {
    white-space: nowrap;
  }
  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-main);
  }
  .nav-item.active {
    background: var(--bg-elevated);
    color: var(--text-main);
    box-shadow: inset 0.125rem 0 0 var(--gold);
  }
  .nav-glyph {
    width: 1.25rem;
    text-align: center;
    color: var(--gold);
    font-size: var(--text-sm);
    flex-shrink: 0;
  }
  .nav-item.active .nav-glyph {
    --fa-secondary-opacity: 0.6;
  }

  /* ── Shell - Nav Badge ──────────────────────────────────────────────────── */
  .nav-item :global(.nav-badge) {
    margin-inline-start: auto;
  }

  /* ── Shell - Site Browser ───────────────────────────────────────────────── */
  /* Opens a window rather than a route, so it's a button that looks like a link. */
  .nav-item-button {
    inline-size: 100%;
    border: 0;
    background: transparent;
    font-family: inherit;
    text-align: start;
    cursor: pointer;
  }
  .nav-error {
    margin: 0;
    padding-inline: 0.625rem;
    color: var(--danger);
    font-size: var(--text-xs);
  }

  /* ── Shell - Sidebar Bottom ─────────────────────────────────────────────── */
  /* The run card and the foot sit together at the bottom of the sidebar. */
  .sidebar-bottom {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-start: auto;
  }

  .sidebar-foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .foot-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }
  .foot-status-server {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .foot-status-server:hover {
    color: var(--text-main);
  }
  .foot-status-server:focus-visible {
    outline: var(--hm-space-0-5) solid var(--gold);
    outline-offset: var(--hm-space-0-5);
  }
  .foot-status-down .dot {
    background: var(--danger);
    box-shadow: 0 0 0.375rem var(--danger);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--ok);
    box-shadow: 0 0 0.375rem var(--ok);
    flex-shrink: 0;
  }
  .collapse-btn {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    margin-inline-start: -0.25rem;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
  }
  .collapse-btn:hover {
    background: var(--bg-hover);
    color: var(--text-main);
  }
  .collapse-btn:focus-visible {
    outline: var(--hm-space-0-5) solid var(--gold);
    outline-offset: var(--hm-space-0-5);
  }
  .collapse-glyph-out {
    display: none;
  }
  :global(html.sidebar-collapsed) .collapse-glyph-in {
    display: none;
  }
  :global(html.sidebar-collapsed) .collapse-glyph-out {
    display: inline-block;
  }

  main {
    overflow-y: auto;
    max-height: 100vh;
  }

  /* ── Shell - Load Bar ───────────────────────────────────────────────────── */
  /* Pinned to the top of the scrolling <main>; the negative margin keeps it
     from pushing the view down when it appears. */
  .load-bar {
    position: sticky;
    inset-block-start: 0;
    z-index: 10;
    block-size: 0.125rem;
    margin-block-end: -0.125rem;
    overflow: hidden;

    &::before {
      display: block;
      inline-size: 30%;
      block-size: 100%;
      background: linear-gradient(
        to right,
        transparent,
        var(--gold),
        transparent
      );
      content: '';
      animation: load-bar-sweep 1.2s ease-in-out infinite;
    }
  }

  @keyframes load-bar-sweep {
    from {
      transform: translateX(-100%);
    }

    to {
      transform: translateX(340%);
    }
  }

  @media (max-width: 720px) {
    .sidebar {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
    }
    .collapse-btn {
      display: none;
    }
    main {
      max-height: none;
    }
  }
</style>
