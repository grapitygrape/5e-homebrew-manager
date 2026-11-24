<!--
  Dashboard — what's loaded and whether anything needs attention: one row per
  content count (sources in use, homebrew, replacements, guides) with the page
  that acts on it, where the content is deployed (the site and any Foundry
  worlds online now), then every configured location. Loaded by +page.ts
  (dashboard-service); the source counts and Foundry status fill in after.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageProps } from './$types';
  import { aggregateAudit } from '$lib/engine/audit';
  import { errorText, formatNumber, plural } from '$lib/util';
  import {
    getCapabilities,
    getDashboardContent,
    runGuideAudit,
    type AuditReport,
    type DashboardContent,
  } from '$lib/api';
  import { peek, remember, tracked } from '$lib/state/page-cache.svelte.ts';
  import { foundry } from '$lib/state/foundry.svelte.ts';
  import Panel from '$lib/ui/Panel.svelte';
  import RowCard from '$lib/ui/RowCard.svelte';
  import View from '$lib/ui/View.svelte';
  import ViewHeader from '$lib/ui/ViewHeader.svelte';
  import Link from '$lib/ui/Link.svelte';
  import StatusText from '$lib/ui/StatusText.svelte';
  import {
    getLocalServerStatus,
    isTauri,
    openExternalTarget,
  } from '$lib/tauri-bridge';

  let { data }: PageProps = $props();

  const CONTENT_KEY = 'dashboard-content';
  const AUDIT_KEY = 'dashboard-audit';
  // Also kept across restarts: a cold index scan takes seconds, and last
  // session's counts are a better placeholder than an ellipsis.
  const STORAGE_KEY = 'hbm-dashboard-content';
  const AUDIT_STORAGE_KEY = 'hbm-dashboard-audit';

  function readStored<T>(key: string): T | undefined {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      return undefined;
    }
  }

  let content = $state<DashboardContent | undefined>(
    peek<DashboardContent>(CONTENT_KEY) ??
      readStored<DashboardContent>(STORAGE_KEY),
  );
  let contentError = $state('');
  let deferredAudit = $state<AuditReport | undefined>(
    peek<AuditReport>(AUDIT_KEY) ?? readStored<AuditReport>(AUDIT_STORAGE_KEY),
  );
  let deferredAuditError = $state('');
  let localPreviewUrl = $state<string | null>(null);

  onMount(() => {
    const readContent = getDashboardContent();
    (content ? tracked(readContent) : readContent)
      .then((c) => {
        content = remember(CONTENT_KEY, c);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      })
      .catch((e: unknown) => {
        contentError = errorText(e);
      });

    const readAudit = runGuideAudit();
    (deferredAudit ? tracked(readAudit) : readAudit)
      .then((report) => {
        deferredAudit = remember(AUDIT_KEY, report);
        deferredAuditError = '';
        localStorage.setItem(
          AUDIT_STORAGE_KEY,
          JSON.stringify({
            timestamp: report.timestamp,
            summary: report.summary,
            details: {},
            branched: {},
          }),
        );
      })
      .catch((e: unknown) => {
        deferredAuditError = errorText(e);
      });

    if (isTauri()) {
      getLocalServerStatus()
        .then((s) => (localPreviewUrl = s.running ? s.url : null))
        .catch(() => (localPreviewUrl = null));
    } else {
      void getCapabilities()
        .then((caps) => {
          if (caps.localSite) {
            getLocalServerStatus()
              .then((s) => (localPreviewUrl = s.running ? s.url : null))
              .catch(() => (localPreviewUrl = null));
          }
        })
        .catch(() => null);
    }
  });

  const lastRunFormat = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const fileCount = $derived(data.homebrew.files.length);
  const invalidFiles = $derived(
    data.homebrew.files.filter((f) => f.error).length,
  );
  const activeAudit = $derived(deferredAudit ?? data.audit);
  const activeAuditError = $derived(deferredAuditError || data.auditError);
  const agg = $derived(
    activeAudit ? aggregateAudit(activeAudit.summary) : null,
  );
  // Until the index answers: a dash on failure, an ellipsis while loading.
  const pending = $derived(contentError ? '—' : '…');

  const isUrl = (target: string) => /^https?:\/\//i.test(target);
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  // A browser tab can open URLs but not folders; the desktop app opens both
  // (system browser, or Explorer/Finder).
  const canOpen = (target: string) => isTauri() || isUrl(target);

  /** Hand links to the system browser in the desktop app. */
  function openLink(e: MouseEvent, url: string) {
    if (!isTauri()) return;
    e.preventDefault();
    void openExternalTarget(url);
  }
</script>

{#snippet externalLink(url: string, text: string)}
  <a
    class="deploy-link"
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    onclick={(e) => openLink(e, url)}
  >
    {text}
    <i
      class="fa-sharp-duotone fa-regular fa-arrow-up-right-from-square"
      aria-hidden="true"
    ></i>
  </a>
{/snippet}

<View>
  <ViewHeader>
    <h1 id="content-heading">Content Overview</h1>
  </ViewHeader>

  <section class="dashboard-section" aria-labelledby="content-heading">
    <RowCard>
      <div class="stat">
        <strong class="stat-value"
          >{content ? formatNumber(content.coreSources) : pending}</strong
        >
        <div class="stat-text">
          <span class="stat-label">Core sources in use</span>
          {#if contentError}
            <StatusText variant="error"
              >Couldn't read the sources: {contentError}</StatusText
            >
          {/if}
        </div>
      </div>
      <div class="actions">
        <Link href="/blocklist" variant="primary">
          <i class="fa-sharp-duotone fa-regular fa-ban" aria-hidden="true"></i>
          Manage sources, homebrew, and allowed content
        </Link>
      </div>
    </RowCard>

    <RowCard>
      <div class="stat">
        <strong class="stat-value"
          >{content ? formatNumber(content.homebrewSources) : pending}</strong
        >
        <div class="stat-text">
          <span class="stat-label">
            Homebrew sources in use
            {#if content?.dependencySources}
              <span class="stat-extra"
                >(+{formatNumber(content.dependencySources)}
                {plural(
                  content.dependencySources,
                  'dependency',
                  'dependencies',
                )})</span
              >
            {/if}
          </span>
          <span class="stat-note">
            {#if data.homebrew.exists}
              {formatNumber(fileCount)}
              {plural(fileCount, 'file', 'files')} in the homebrew folder
            {:else}
              Homebrew folder not found — set it in Settings.
            {/if}
          </span>
          {#if invalidFiles}
            <StatusText variant="error">
              {invalidFiles}
              {plural(invalidFiles, 'file is', 'files are')} invalid JSON.
            </StatusText>
          {/if}
        </div>
      </div>
      <div class="actions">
        <Link href="/files" variant="primary">
          <i class="fa-sharp-duotone fa-regular fa-files" aria-hidden="true"
          ></i>
          Manage and validate homebrew files
        </Link>
      </div>
    </RowCard>

    <RowCard>
      <div class="stat">
        <strong class="stat-value">{formatNumber(data.replacementCount)}</strong
        >
        <div class="stat-text">
          <span class="stat-label">Content replacements</span>
          <span class="stat-note">
            Specify content replaced by homebrew sources to automatically
            replace content in the deployed site and Foundry.
          </span>
        </div>
      </div>
      <div class="actions">
        <Link href="/replacement" variant="secondary">
          <i class="fa-sharp-duotone fa-regular fa-swap" aria-hidden="true"></i>
          Replace content
        </Link>
      </div>
    </RowCard>

    <RowCard>
      <div class="stat">
        <strong class="stat-value">{formatNumber(data.guides.length)}</strong>
        <div class="stat-text">
          <span class="stat-label">Available content guides</span>
          {#if activeAuditError}
            <StatusText variant="error"
              >The guide audit failed: {activeAuditError}</StatusText
            >
          {:else if activeAudit && agg}
            <span class="stat-note">
              {agg.guides ? `${agg.coverage}% schema coverage, ` : ''}audit last
              run {lastRunFormat.format(activeAudit.timestamp)}
            </span>
            {#if agg.guides === 0}
              <StatusText variant="warning"
                >No guides were checked. Check the schema and guides folders in
                Settings.</StatusText
              >
            {:else}
              {#if agg.missing}
                <StatusText variant="error"
                  >{formatNumber(agg.missing)} undocumented
                  {plural(agg.missing, 'field', 'fields')}</StatusText
                >
              {/if}
              {#if agg.extra}
                <StatusText variant="warning"
                  >{formatNumber(agg.extra)} mismatched
                  {plural(agg.extra, 'field', 'fields')}</StatusText
                >
              {/if}
            {/if}
          {/if}
        </div>
      </div>
      <div class="actions">
        <Link href="/guides" variant="secondary">
          <i class="fa-sharp-duotone fa-regular fa-book" aria-hidden="true"></i>
          View homebrew guides
        </Link>
        <Link href="/parser" variant="primary">
          <i class="fa-sharp-duotone fa-regular fa-toolbox" aria-hidden="true"
          ></i>Build a new homebrew file</Link
        >
      </div>
    </RowCard>
  </section>

  <section class="dashboard-section" aria-labelledby="deploy-heading">
    <h2 id="deploy-heading">Deployment locations</h2>

    <RowCard>
      <div class="deploy-text">
        <span class="stat-label">Your deployed site</span>
        {#if data.links.toolsUrl}
          <div class="deploy-links">
            {@render externalLink(
              data.links.toolsUrl,
              hostOf(data.links.toolsUrl),
            )}
          </div>
        {:else}
          <span class="stat-note">No site URL — add one in Settings.</span>
        {/if}
      </div>
      <div class="actions">
        {#if localPreviewUrl}
          {@const previewUrl = localPreviewUrl}
          <Link
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            onclick={(e: MouseEvent) => openLink(e, previewUrl)}
          >
            <i class="fa-sharp-duotone fa-regular fa-browser" aria-hidden="true"
            ></i>
            Preview the site locally
          </Link>
        {/if}
        {#if data.links.toolsUrl}
          <Link
            href={data.links.toolsUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            onclick={(e: MouseEvent) => openLink(e, data.links.toolsUrl)}
          >
            <i
              class="fa-sharp-duotone fa-regular fa-arrow-up-right-from-square"
              aria-hidden="true"
            ></i>
            Visit {data.links.toolsUrl}
          </Link>
        {/if}
      </div>
    </RowCard>

    <RowCard>
      <div class="deploy-text">
        <span class="stat-label">Online Foundry instances</span>
        {#if !foundry.loaded}
          <span class="stat-note">Checking…</span>
        {:else if foundry.status.clients.length}
          <ul class="foundry-worlds">
            {#each foundry.status.clients as client (client.clientId)}
              <li>
                {@render externalLink(client.origin, client.world)}
                <span class="stat-note"
                  >{hostOf(client.origin)} · {client.system}
                  {client.systemVersion} · {client.user}</span
                >
              </li>
            {/each}
          </ul>
        {:else}
          <span class="stat-note">None online.</span>
          {#if data.links.foundryUrls.length}
            <div class="deploy-links">
              {#each data.links.foundryUrls as url (url)}
                {@render externalLink(url, hostOf(url))}
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </RowCard>
  </section>

  <Panel>
    <h2>Configured data sources</h2>
    {#if data.sources.length}
      <dl>
        {#each data.sources as source (source.label)}
          <dt>{source.label}</dt>
          <dd>
            {#each source.targets as target (target)}
              {#if canOpen(target)}
                <button
                  type="button"
                  class="source-target"
                  title={isUrl(target) ? 'Open in browser' : 'Open folder'}
                  onclick={() => openExternalTarget(target)}
                  ><code>{target}</code></button
                >
              {:else}
                <code>{target}</code>
              {/if}
            {/each}
          </dd>
        {/each}
      </dl>
    {:else}
      <p class="muted">Nothing configured yet — see Settings.</p>
    {/if}
  </Panel>
</View>

<style>
  /* ── Dashboard - Sections ─────────────────────────────────────────────── */
  .dashboard-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-block-end: var(--space-6);

    h2 {
      margin: 0;
    }
  }

  /* ── Dashboard - Stat rows ────────────────────────────────────────────── */
  /* A fixed number column, so the labels line up down the list. */
  .stat {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr);
    gap: var(--space-4);
    align-items: center;
  }
  .stat-value {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    line-height: 1;
    color: var(--gold-bright);
  }
  .stat-text,
  .deploy-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .stat-label {
    font-size: var(--text-base);
    color: var(--text-main);
  }
  .stat-extra,
  .stat-note {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: var(--hm-space-2-5);
  }
  @media (max-width: 720px) {
    .actions {
      justify-content: flex-start;
    }
  }

  /* ── Dashboard - Deployment links ─────────────────────────────────────── */
  .deploy-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
  }
  .deploy-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    color: var(--gold-bright);
    text-decoration: none;
    overflow-wrap: anywhere;

    i {
      font-size: var(--text-xs);
      color: var(--gold);
    }
  }
  .deploy-link:hover {
    text-decoration: underline;
  }
  .deploy-link:focus-visible {
    outline: var(--hm-space-0-5) solid var(--gold);
    outline-offset: var(--hm-space-0-5);
  }
  .foundry-worlds {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--space-1) var(--space-3);
    }
  }

  /* ── Dashboard - Data sources ─────────────────────────────────────────── */
  .muted {
    margin: 0 0 var(--space-6);
    color: var(--text-faint);
    font-size: var(--text-sm);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.375rem 1rem;
    margin: var(--space-2) 0 0;
  }
  dt {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    margin: 0;
  }
  .source-target {
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .source-target:hover code {
    color: var(--gold-bright);
    text-decoration: underline;
  }
  .source-target:focus-visible {
    outline: var(--hm-space-0-5) solid var(--gold);
    outline-offset: var(--hm-space-0-5);
  }
</style>
