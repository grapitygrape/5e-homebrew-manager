<script lang="ts">
  import SourceBrowser from '$lib/components/SourceBrowser.svelte';
  import type {
    IndexedEntity,
    SourceSummary,
    SourceTypeCount,
  } from '$lib/components/source-browser.ts';
  import { getAllowedWithBlockedParents } from '$lib/api';
  import {
    describeChildSummary,
    entryKey,
    propLabel,
    unblockNode,
  } from '$lib/engine/blocklist';
  import type {
    AllowedChildWithBlockedParent,
    BlocklistEntry,
  } from '$lib/engine/blocklist';
  import { formatNumber, plural } from '$lib/util';
  import BlockedFilterMenu from './BlockedFilterMenu.svelte';
  import {
    allowedCount,
    blockedItemsInSource,
    blockedItemsInType,
    boxTitle,
    buildChildRules,
    coverage,
    itemState,
    keyFor,
    sourceState,
    toneOf,
    typeState,
    type BlocklistBannerState,
    type ConfirmCascade,
    type NodeState,
  } from './blocklist-model.ts';
  import { cascadeBannerText, cascadeEdit } from './cascade-edit.ts';

  let {
    dataPath,
    indexWarm,
    entries = $bindable([]),
    sources = $bindable([]),
    browser = $bindable(null),
    hideBlocked = $bindable(false),
    showBlockedParentAllowed = $bindable(false),
    unblocking = $bindable(false),
    onbanner,
    onerror,
    confirmCascade,
  }: {
    dataPath: string;
    indexWarm: boolean;
    entries?: BlocklistEntry[];
    sources?: SourceSummary[];
    browser?: ReturnType<typeof SourceBrowser> | null;
    hideBlocked?: boolean;
    showBlockedParentAllowed?: boolean;
    unblocking?: boolean;
    onbanner?: (banner: BlocklistBannerState) => void;
    onerror?: (text: string) => void;
    /** Asks whether a parent edit should carry to its children. */
    confirmCascade?: ConfirmCascade;
  } = $props();

  const ruleKeys = $derived(new Set(entries.map(entryKey)));
  const childRules = $derived(buildChildRules(entries));

  let orphans = $state.raw<AllowedChildWithBlockedParent[]>([]);
  let loadingOrphans = $state(false);
  let orphanSeq = 0;
  /** Open the tree to the results once, right after the filter is switched on. */
  let expandOnLoad = false;

  function setShowOrphans(on: boolean) {
    showBlockedParentAllowed = on;
    if (on) expandOnLoad = true;
    else browser?.collapseAll();
  }

  // Re-checked on every rule edit while the filter is on; `orphanSeq` drops
  // answers that arrive after a newer request.
  $effect(() => {
    const seq = ++orphanSeq;
    if (!showBlockedParentAllowed) {
      orphans = [];
      loadingOrphans = false;
      return;
    }
    loadingOrphans = true;
    getAllowedWithBlockedParents(entries)
      .then((list) => {
        if (seq !== orphanSeq) return;
        orphans = list;
        if (expandOnLoad && list.length) {
          expandOnLoad = false;
          browser?.openFor(list);
        }
      })
      .catch((e) => {
        if (seq !== orphanSeq) return;
        orphans = [];
        onbanner?.({
          tone: 'error',
          text: `Could not check blocked parents: ${(e as Error).message}`,
        });
      })
      .finally(() => {
        if (seq === orphanSeq) loadingOrphans = false;
      });
  });

  const orphanIndex = $derived.by(() => {
    const srcs = new Set<string>();
    const types = new Set<string>();
    const items = new Map<string, AllowedChildWithBlockedParent>();
    for (const item of orphans) {
      const src = item.source.toLowerCase();
      srcs.add(src);
      types.add(`${src}|${item.prop}`);
      items.set(`${src}|${item.prop}|${item.hash.toLowerCase()}`, item);
    }
    return { srcs, types, items };
  });

  const showSource = (s: SourceSummary): boolean => {
    if (showBlockedParentAllowed) {
      return orphanIndex.srcs.has(s.source.toLowerCase());
    }
    return !hideBlocked || coverage(ruleKeys, '*', '*', s.source) !== 'exact';
  };

  const showType = (s: SourceSummary, t: SourceTypeCount): boolean => {
    if (showBlockedParentAllowed) {
      return orphanIndex.types.has(`${s.source.toLowerCase()}|${t.prop}`);
    }
    return !hideBlocked || coverage(ruleKeys, '*', t.prop, s.source) === 'none';
  };

  const showItem = (
    source: string,
    prop: string,
    item: IndexedEntity,
  ): boolean => {
    if (showBlockedParentAllowed) {
      return orphanIndex.items.has(
        `${source.toLowerCase()}|${prop}|${item.hash.toLowerCase()}`,
      );
    }
    return !hideBlocked || coverage(ruleKeys, item.hash, prop, source) === 'none';
  };

  function itemTitle(
    state: NodeState,
    source: string,
    prop: string,
    item: IndexedEntity,
  ): string {
    const base = boxTitle(ruleKeys, state, `"${item.name}"`, source, prop, 0);
    if (!showBlockedParentAllowed) return base;
    const orphan = orphanIndex.items.get(
      `${source.toLowerCase()}|${prop}|${item.hash.toLowerCase()}`,
    );
    if (!orphan?.blockedParents.length) return base;
    const parents = orphan.blockedParents
      .map((p) => `${p.name} (${p.source})`)
      .join(', ');
    return `${base} - blocked parent: ${parents}`;
  }

  const ensureItems = (
    source: string,
    prop: string,
  ): Promise<IndexedEntity[] | null> =>
    browser?.ensureItems(source, prop) ?? Promise.resolve(null);

  /**
   * Keep the DOM checkbox aligned with reactive state while an async child
   * lookup or confirmation modal is pending, so cancelling never leaves a
   * checkbox visually out of sync.
   */
  function syncBox(el: HTMLInputElement, state: NodeState) {
    el.checked = state === 'none';
    el.indeterminate = state === 'partial';
  }


  const warn = (text: string) => onbanner?.({ tone: 'warn', text });

  async function toggle(
    hash: string,
    category: string,
    source: string,
    displayName: string,
  ) {
    if (unblocking) return;
    const key = keyFor(hash, category, source);
    const existing = entries.find((e) => entryKey(e) === key);
    if (existing?.isAuto) {
      warn("That rule is auto-managed and can't be removed here.");
      return;
    }

    const rule: BlocklistEntry = {
      displayName,
      hash,
      category,
      source,
      isAuto: false,
    };
    unblocking = true;
    try {
      const res = await cascadeEdit({
        mode: existing ? 'unblock' : 'block',
        target: rule,
        current: () => entries,
        change: existing
          ? (list) => list.filter((e) => entryKey(e) !== key)
          : (list) =>
              list.some((e) => entryKey(e) === key) ? list : [...list, rule],
        confirm: confirmCascade,
        onwarn: warn,
      });
      if (!res) return;
      entries = res.entries;
      const text = cascadeBannerText(res);
      if (text) onbanner?.({ tone: 'ok', text });
    } finally {
      unblocking = false;
    }
  }

  async function onTick(
    hash: string,
    category: string,
    source: string,
    displayName: string,
  ) {
    if (coverage(ruleKeys, hash, category, source) !== 'covered') {
      await toggle(hash, category, source, displayName);
      return;
    }
    await unblock(hash, category, source, displayName);
  }

  async function unblock(
    hash: string,
    category: string,
    source: string,
    displayName: string,
  ) {
    if (unblocking) return;
    const summary = sources.find(
      (s) => s.source.toLowerCase() === source.toLowerCase(),
    );
    if (!summary) return;

    unblocking = true;
    try {
      let siblings: { hash: string; name: string }[] = [];
      if (hash !== '*') {
        const items = await ensureItems(source, category);
        if (!items) return;
        siblings = items.map((i) => ({ hash: i.hash, name: i.name }));
      }

      const node = { hash, category, source };
      const ctx = { types: summary.types.map((t) => t.prop), siblings };
      if (unblockNode(entries, node, ctx).refusedAuto) {
        warn("A rule covering that is auto-managed and can't be changed here.");
        return;
      }

      // The carve-out reruns on the entries current at confirm time; keep the
      // last run's count for the banner.
      let added = 0;
      const res = await cascadeEdit({
        mode: 'unblock',
        target: { ...node, displayName },
        current: () => entries,
        change: (list) => {
          const r = unblockNode(list, node, ctx);
          added = r.added;
          return r.entries;
        },
        confirm: confirmCascade,
        onwarn: warn,
      });
      if (!res) return;
      entries = res.entries;

      const what =
        hash === '*'
          ? `${propLabel(category)} from ${source}`
          : `"${displayName}"`;
      const rules = `${added} new ${plural(added, 'rule', 'rules')}`;
      let text: string;
      if (res.cascaded.length) {
        const kept = added ? ` (${rules} kept the rest of ${source} blocked)` : '';
        text = `Un-blocked ${what} and removed ${describeChildSummary(res.cascaded)} from the blocklist${kept} - nothing is written until you Save.`;
      } else {
        text = added
          ? `Un-blocked ${what}. Keeping the rest of ${source} blocked took ${rules} - nothing is written until you Save.`
          : `Un-blocked ${what}. Nothing else in ${source} needed a rule.`;
      }
      onbanner?.({ tone: 'ok', text });
    } finally {
      unblocking = false;
    }
  }
</script>

<SourceBrowser
  bind:this={browser}
  {dataPath}
  {indexWarm}
  pinnedItems={showBlockedParentAllowed ? orphans : undefined}
  sourceFilter={showSource}
  typeFilter={showType}
  itemFilter={showItem}
  sourceTone={(s) => toneOf(sourceState(ruleKeys, childRules, s.source))}
  typeTone={(s, t) => toneOf(typeState(ruleKeys, childRules, s.source, t.prop))}
  itemTone={(source, prop, item) =>
    toneOf(itemState(ruleKeys, item.hash, prop, source))}
  onSources={({ sources: loaded }) => (sources = loaded)}
  onError={(text) => onerror?.(text)}
  noTypesMessage={(s) => `Every content type in ${s.source} is blocked.`}
  noMatchMessage={({ query, total }) =>
    showBlockedParentAllowed
      ? loadingOrphans
        ? 'Checking for allowed content with blocked parents…'
        : query
          ? `No allowed content with blocked parents matches "${query}".`
          : 'No allowed content has a blocked parent.'
      : hideBlocked && total
        ? 'Everything matching is blocked - untick "Hide all blocked content" to see it.'
        : `No source matches "${query}".`}
>
  {#snippet filterControls()}
    <BlockedFilterMenu
      bind:hideBlocked
      bind:showBlockedParentAllowed={() => showBlockedParentAllowed, setShowOrphans}
      loading={loadingOrphans}
    />
  {/snippet}

  {#snippet sourceLead(s)}
    {@const state = sourceState(ruleKeys, childRules, s.source)}
    <input
      type="checkbox"
      checked={state === 'none'}
      indeterminate={state === 'partial'}
      disabled={state === 'covered' || unblocking}
      class:ind={state === 'partial'}
      title={boxTitle(
        ruleKeys,
        state,
        `everything from ${s.source}`,
        s.source,
        '*',
        state === 'partial' ? blockedItemsInSource(ruleKeys, childRules, s) : 0,
      )}
      onchange={(ev) => {
        syncBox(ev.currentTarget, state);
        void onTick('*', '*', s.source, '*');
      }}
    />
  {/snippet}

  {#snippet sourceCount(s)}
    {@const blocked = blockedItemsInSource(ruleKeys, childRules, s)}
    {formatNumber(allowedCount(s.total, blocked))}/{formatNumber(s.total)}
  {/snippet}

  {#snippet typeLead(s, t)}
    {@const state = typeState(ruleKeys, childRules, s.source, t.prop)}
    <input
      type="checkbox"
      checked={state === 'none'}
      indeterminate={state === 'partial'}
      disabled={unblocking}
      class:ind={state === 'partial'}
      title={boxTitle(
        ruleKeys,
        state,
        `${t.label.toLowerCase()} from ${s.source}`,
        s.source,
        t.prop,
        state === 'partial'
          ? blockedItemsInType(ruleKeys, childRules, s.source, t.prop, t.count)
          : 0,
      )}
      onchange={(ev) => {
        syncBox(ev.currentTarget, state);
        void onTick('*', t.prop, s.source, '*');
      }}
    />
  {/snippet}

  {#snippet typeCount(s, t)}
    {@const blocked = blockedItemsInType(
      ruleKeys,
      childRules,
      s.source,
      t.prop,
      t.count,
    )}
    {formatNumber(allowedCount(t.count, blocked))}/{formatNumber(t.count)}
  {/snippet}

  {#snippet itemLead(s, t, item)}
    {@const state = itemState(ruleKeys, item.hash, t.prop, s.source)}
    <input
      type="checkbox"
      checked={state === 'none'}
      disabled={unblocking}
      title={itemTitle(state, s.source, t.prop, item)}
      onchange={(ev) => {
        syncBox(ev.currentTarget, state);
        void onTick(item.hash, t.prop, s.source, item.name);
      }}
    />
  {/snippet}
</SourceBrowser>
