<!--
  OutlinePane — the Parser's right-hand pane: the Objects tree (grouped by
  type, or filtered), the Errors tab (every flagged object, click to jump to
  the spot in the editor), and the Resolved / Checks / entry-preview tabs.
  All document state lives in the ParserController; the tab, filter and which
  rows have their issues expanded are this pane's own.
-->
<script lang="ts">
  import { extractPropName } from '$lib/engine/audit';
  import type {
    LinkIssue,
    NodeLinkIssues,
    ParsedNode,
  } from '$lib/engine/audit';
  import {
    entityLabel,
    keyOf,
    pageOf,
    type ParserController,
  } from '$lib/state/parser-controller.svelte';
  import Badge from '$lib/ui/Badge.svelte';
  import EmptyState from '$lib/ui/EmptyState.svelte';
  import TextInput from '$lib/ui/TextInput.svelte';
  import ChecksPanel from '$lib/components/checks/ChecksPanel.svelte';
  import EntityLabel from './EntityLabel.svelte';
  import IssueItem from './IssueItem.svelte';
  import PreviewPane from './PreviewPane.svelte';

  let { ctl }: { ctl: ParserController } = $props();

  let tab = $state<'nav' | 'errors' | 'resolved' | 'checks'>('nav');
  let filter = $state('');
  let expanded = $state(new Set<string>());

  const linkFor = (n: ParsedNode): NodeLinkIssues | undefined =>
    ctl.linkIssues.get(keyOf(n));

  // Grouped roots (file order) for the default (unfiltered) outline.
  const groups = $derived.by(() => {
    const map = new Map<string, ParsedNode[]>();
    for (const n of ctl.parsed?.roots ?? [])
      (map.get(n.type) ?? map.set(n.type, []).get(n.type)!).push(n);
    return [...map.entries()];
  });
  const filteredNodes = $derived.by(() => {
    const q = filter.toLowerCase().trim();
    if (!q || !ctl.parsed) return [];
    return ctl.parsed.nodes.filter(
      (n) =>
        (n.entity.name ?? '').toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q),
    );
  });

  // Every node with any issue, in file order — the Errors tab's content.
  interface IssueEntry {
    node: ParsedNode;
    key: string;
    errors: string[];
    warnings: string[];
    linkErrors: LinkIssue[];
    linkWarnings: LinkIssue[];
  }
  const issueList = $derived.by((): IssueEntry[] => {
    if (!ctl.parsed) return [];
    const out: IssueEntry[] = [];
    for (const n of ctl.parsed.nodes) {
      const li = ctl.linkIssues.get(keyOf(n));
      const linkErrors = li?.errors ?? [];
      const linkWarnings = li?.warnings ?? [];
      if (
        n.errors.length +
          n.warnings.length +
          linkErrors.length +
          linkWarnings.length ===
        0
      )
        continue;
      out.push({
        node: n,
        key: keyOf(n),
        errors: n.errors,
        warnings: n.warnings,
        linkErrors,
        linkWarnings,
      });
    }
    return out;
  });

  function toggleIssues(node: ParsedNode): void {
    const k = keyOf(node);
    const next = new Set(expanded);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    expanded = next;
  }

  const issueCounts = (n: ParsedNode) => {
    const li = linkFor(n);
    const linkErr = li?.errors.length ?? 0;
    const linkWarn = li?.warnings.length ?? 0;
    return {
      err: n.errors.length,
      warn: n.warnings.length,
      linkErr,
      linkWarn,
      clean: !n.errors.length && !n.warnings.length && !linkErr && !linkWarn,
    };
  };
</script>

<div class="outline-pane">
  <div class="outline-head">
    <div class="tabs" role="tablist">
      <button
        class="tab"
        class:on={tab === 'nav'}
        role="tab"
        aria-selected={tab === 'nav'}
        onclick={() => (tab = 'nav')}
        >{ctl.isEntry ? 'Preview' : 'Objects'}</button
      >
      <button
        class="tab"
        class:on={tab === 'errors'}
        role="tab"
        aria-selected={tab === 'errors'}
        onclick={() => (tab = 'errors')}
      >
        Errors
        {#if ctl.totalErrors + ctl.totalWarnings > 0}<Badge
            variant={ctl.totalErrors ? 'danger' : 'warning'}
            class="tab-count">{ctl.totalErrors + ctl.totalWarnings}</Badge
          >{/if}
      </button>
      {#if !ctl.isEntry}
        <button
          class="tab"
          class:on={tab === 'resolved'}
          role="tab"
          aria-selected={tab === 'resolved'}
          title="The selected object after _copy, _mod, _templates and _versions, as the site will show it"
          onclick={() => (tab = 'resolved')}>Resolved</button
        >
        <button
          class="tab"
          class:on={tab === 'checks'}
          role="tab"
          aria-selected={tab === 'checks'}
          title="Homebrew-repo submission checks and collisions for this file"
          onclick={() => (tab = 'checks')}>Checks</button
        >
      {/if}
    </div>
    {#if tab === 'nav' && !ctl.isEntry}
      <TextInput
        class="filter"
        placeholder="Filter objects."
        bind:value={filter}
        aria-label="Filter outline"
      />
    {/if}
  </div>
  <div class="outline-body">
    {#if ctl.parseError}
      <div class="msg err">{ctl.parseError}</div>
    {:else if ctl.isEntry}
      {#if tab === 'errors'}
        {#if ctl.fileIssues.length}
          {@render fileIssueList('entry')}
        {:else}
          <EmptyState>
            {ctl.schemaStatus.state === 'ready'
              ? 'The entry matches the schema.'
              : 'Entries are only checked with the full schema.'}
          </EmptyState>
        {/if}
      {:else}
        <PreviewPane {ctl} />
      {/if}
    {:else if !ctl.parsed}
      <EmptyState>
        Paste a homebrew file on the left to see an outline here.
      </EmptyState>
    {:else if tab === 'resolved'}
      <PreviewPane {ctl} />
    {:else if tab === 'checks'}
      <ChecksPanel raw={ctl.docText} file={ctl.fileParam || ctl.repoFile} />
    {:else if tab === 'errors'}
      {#if issueList.length === 0 && ctl.fileIssues.length === 0}
        <EmptyState>
          No errors or warnings - every object is clean. <i
            class="fa-sharp-duotone fa-regular fa-check"
            aria-hidden="true"
          ></i>
        </EmptyState>
      {:else}
        {#if ctl.fileIssues.length}{@render fileIssueList('file')}{/if}
        {#each issueList as entry (entry.key)}
          <div
            class="e-head"
            role="button"
            tabindex="0"
            onclick={() => ctl.navigateTo(entry.node)}
            onkeydown={(e) => e.key === 'Enter' && ctl.navigateTo(entry.node)}
          >
            <EntityLabel
              type={entry.node.type}
              name={entityLabel(entry.node)}
            />
            <span class="e-counts">
              {#if entry.errors.length + entry.linkErrors.length}<Badge
                  variant="danger"
                  >{entry.errors.length + entry.linkErrors.length}</Badge
                >{/if}
              {#if entry.warnings.length + entry.linkWarnings.length}<Badge
                  variant="warning"
                  >{entry.warnings.length + entry.linkWarnings.length}</Badge
                >{/if}
            </span>
          </div>
          {@render nodeIssues(
            entry.node,
            entry.errors,
            entry.warnings,
            entry.linkErrors,
            entry.linkWarnings,
            false,
          )}
        {/each}
      {/if}
    {:else if filter.trim()}
      {#each filteredNodes as node (keyOf(node))}
        {@render row(node)}
      {/each}
      {#if filteredNodes.length === 0}<EmptyState>
          No objects match the filter.
        </EmptyState>{/if}
    {:else}
      {#each groups as [type, roots] (type)}
        <div class="group-head">
          <span>{type}</span><span class="count"
            >{roots.length}
            {roots.length === 1 ? 'object' : 'objects'}</span
          >
        </div>
        {#each roots as node (keyOf(node))}
          {@render tree(node)}
        {/each}
      {/each}
    {/if}
  </div>
</div>

{#snippet fileIssueList(label: string)}
  <div class="e-head">
    <EntityLabel
      type={label}
      name={label === 'entry' ? 'Schema' : 'Outside any object'}
    />
    <span class="e-counts"
      ><Badge variant="danger">{ctl.fileIssues.length}</Badge></span
    >
  </div>
  {#each ctl.fileIssues as fi, i (i)}
    <IssueItem
      severity="err"
      html={fi.html}
      onactivate={() => ctl.jumpTo(fi.from, fi.to)}
    />
  {/each}
{/snippet}

<!-- One object's issues. The Errors tab lists errors, then link errors, then
     warnings, then link warnings; an expanded row lists both link kinds last. -->
{#snippet nodeIssues(
  node: ParsedNode,
  errors: string[],
  warnings: string[],
  linkErrors: LinkIssue[],
  linkWarnings: LinkIssue[],
  inset: boolean,
)}
  {#each errors as msg, i (i)}
    <IssueItem
      severity="err"
      html={msg}
      {inset}
      onactivate={() => ctl.gotoIssue(node, i, msg)}
    />
  {/each}
  {#if !inset}{@render linkIssueItems(node, linkErrors, 'err', inset)}{/if}
  {#each warnings as msg, i (i)}
    <IssueItem
      severity="warn"
      html={msg}
      {inset}
      onactivate={() => ctl.navigateTo(node, extractPropName(msg))}
    />
  {/each}
  {#if inset}{@render linkIssueItems(node, linkErrors, 'err', inset)}{/if}
  {@render linkIssueItems(node, linkWarnings, 'warn', inset)}
{/snippet}

{#snippet linkIssueItems(
  node: ParsedNode,
  issues: LinkIssue[],
  severity: 'err' | 'warn',
  inset: boolean,
)}
  {#each issues as li, i (i)}
    <IssueItem
      {severity}
      link
      html={li.msg}
      title={li.plain}
      {inset}
      onactivate={() => ctl.navigateTo(node, li.at)}
    />
  {/each}
{/snippet}

{#snippet tree(node: ParsedNode)}
  {@render row(node)}
  {#each node.children as child (keyOf(child))}
    {@render tree(child)}
  {/each}
{/snippet}

{#snippet row(node: ParsedNode)}
  {@const b = issueCounts(node)}
  {@const li = linkFor(node)}
  <div
    class="row"
    class:has-error={b.err || b.linkErr}
    class:has-warning={!b.err && !b.linkErr && (b.warn || b.linkWarn)}
    class:active={ctl.activeKey === keyOf(node)}
    style="padding-left: {node.depth * 16 + 10}px"
    role="button"
    tabindex="0"
    onclick={() => ctl.navigateTo(node)}
    onkeydown={(e) => e.key === 'Enter' && ctl.navigateTo(node)}
  >
    <EntityLabel type={node.type} name={entityLabel(node)} />
    {#if pageOf(node)}<span class="r-page" title="Page {pageOf(node)}"
        >p{pageOf(node)}</span
      >{/if}
    <span class="r-badges">
      {#if b.err}<Badge
          variant="danger"
          prefix={b.err}
          suffix={b.err === 1 ? 'error' : 'errors'}
          class="badge-click"
          role="button"
          tabindex={0}
          onclick={(e) => {
            e.stopPropagation();
            toggleIssues(node);
          }}
        />{/if}
      {#if b.warn}<Badge
          variant="warning"
          prefix={b.warn}
          suffix={b.warn === 1 ? 'warning' : 'warnings'}
          class="badge-click"
          role="button"
          tabindex={0}
          onclick={(e) => {
            e.stopPropagation();
            toggleIssues(node);
          }}
        />{/if}
      {#if b.linkErr || b.linkWarn}<Badge
          variant={b.linkErr ? 'danger' : 'warning'}
          class="badge-click"
          title="Broken content links"
          role="button"
          tabindex={0}
          onclick={(e) => {
            e.stopPropagation();
            toggleIssues(node);
          }}>{b.linkErr + b.linkWarn}</Badge
        >{/if}
      {#if b.clean}<span class="b-ok"
          ><i class="fa-sharp-duotone fa-regular fa-check" aria-hidden="true"
          ></i></span
        >{/if}
    </span>
  </div>
  {#if expanded.has(keyOf(node))}
    <div class="issues" style="padding-left: {node.depth * 16 + 28}px">
      {@render nodeIssues(
        node,
        node.errors,
        node.warnings,
        li?.errors ?? [],
        li?.warnings ?? [],
        true,
      )}
    </div>
  {/if}
{/snippet}

<style>
  .outline-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-panel);
  }
  .outline-head {
    padding: 0.625rem 0.75rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
  }
  .tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--text-muted);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .tab.on {
    color: var(--text-main);
    background: var(--bg-elevated);
    border-color: var(--gold);
  }
  .outline-head :global(.tab-count) {
    font-size: var(--text-xs);
  }
  .outline-head :global(.filter) {
    width: 100%;
  }
  .outline-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.375rem 0;
  }

  .group-head {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0.875rem 0.25rem;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--text-faint);
  }
  .group-head .count {
    text-transform: none;
    letter-spacing: var(--tracking-normal);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.75rem;
    cursor: pointer;
    border-left: 0.125rem solid transparent;
  }
  .row:hover {
    background: var(--bg-hover);
  }
  .row.active {
    background: var(--bg-elevated);
    border-left-color: var(--gold);
  }
  .row.has-error {
    border-left-color: var(--danger);
  }
  .row.has-warning {
    border-left-color: var(--warn);
  }
  .r-badges {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .r-badges :global(.badge-click) {
    cursor: pointer;
    font-size: var(--hm-text-2xs);
  }
  .b-ok {
    color: var(--ok);
    font-size: var(--text-xs);
  }
  .r-page {
    flex-shrink: 0;
    font-size: var(--hm-text-2xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
  }

  /* Errors tab */
  .e-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem 0.25rem;
    cursor: pointer;
    margin-top: 0.25rem;
    border-top: 1px solid var(--border);
  }
  .e-head:first-child {
    border-top: none;
    margin-top: 0;
  }
  .e-head:hover {
    background: var(--bg-hover);
  }
  .e-counts {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .e-counts :global(.badge) {
    font-size: var(--hm-text-2xs);
  }

  .issues {
    padding-right: 0.75rem;
    padding-bottom: 0.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .msg.err {
    color: var(--danger);
    padding: 0.75rem;
    font-size: var(--text-sm);
  }

  @media (max-width: 860px) {
    .outline-pane {
      display: none;
    }
  }
</style>
