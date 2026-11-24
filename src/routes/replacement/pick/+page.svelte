<!--
  /replacement/pick - staging one mapping, then handing it back to the table.

  WHAT THIS ROUTE IS FOR
    Picking entities is a different job with a different shape from reading the
    mappings: it needs the whole corpus as a tree and two staging lists. So it
    is its own route rather than a third of the table page, and the two share
    `state/supersessions.svelte.ts` - which is what lets a group survive the
    navigation in both directions.

  NOTHING HERE TOUCHES DISK
    Save stages into `doc.rows` and returns. The Replace Content page's Save is
    still the only writer; this one only decides what it will write.

  TWO ENTRY POINTS, ONE DIFFERENCE
    "Add a replacement" arrives with an empty picker and merges (purely
    additive). "Edit" arrives with the group's chips AND its row keys, and Save
    deletes those rows before merging - which is the only reason removing a
    chip can actually remove a mapping. See engine/supersession/edit.ts.

  THE TREE OWNS THE SEARCH
    This page draws no search box. SourceBrowser's own filter row - one search,
    the type select, and the "hide blocked" toggle supplied below - is the same
    row on every page that draws the tree. A box up here would narrow what the
    tree found without saying so, which is what it used to do.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Banner, { type BannerState } from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import SourceBrowser from '$lib/components/SourceBrowser.svelte';
  import PickActions from '$lib/components/replacement/PickActions.svelte';
  import PickBoxes from '$lib/components/replacement/PickBoxes.svelte';
  import {
    itemKey,
    type ColumnKey,
    type IndexedEntity,
    type SourceSummary,
  } from '$lib/components/source-browser.ts';
  import {
    buildManualRows,
    isSupersedableProp,
    mergeRows,
    overrideId,
    propToPage,
    replaceGroup,
    SupersessionBuildError,
  } from '$lib/engine/supersession';
  import type { EntityRef, MergeRowsResult } from '$lib/engine/supersession';
  import type { PickedEntity } from '$lib/state/supersessions.svelte.ts';
  import type { BlocklistEntry } from '$lib/engine/blocklist';
  import {
    buildBlockedIndex,
    isEntityBlocked,
    EMPTY_BLOCKED_INDEX,
  } from '$lib/components/replacement/blocked.ts';
  import { loadBlockEntries } from '$lib/components/replacement/load-block-entries.ts';
  import {
    doc,
    loadDocument,
    picker,
    resetPicker,
  } from '$lib/state/supersessions.svelte.ts';
  import { formatNumber, plural } from '$lib/util';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  /**
   * Count before Added, unlike the Blocklist's default. The picker's rows are
   * scanned for "how much is in here", and the date is the column you look at
   * last; the array is the header's order, so saying it here is saying it.
   */
  const PICKER_COLUMNS: readonly ColumnKey[] = [
    'abbr',
    'name',
    'tags',
    'count',
    'added',
    'actions',
  ];

  let loading = $state(true);

  let banner = $state<BannerState | null>(null);
  const fail = (text: string) => (banner = { tone: 'error', text });

  const editing = $derived(picker.editingKeys.length > 0);

  // --- the document behind the picker ----------------------------------------
  /**
   * A deep link or a refresh lands here with nothing loaded, and Save would
   * then build against an empty document and silently drop every mapping on
   * the next write. `loadDocument` is a no-op when the table already read the
   * file, so arriving from the table keeps the unsaved edits.
   *
   * A FAILED read has to keep Save off, which is why `doc.loaded` gates it and
   * not this flag: `loading` only says the attempt is over. The two states are
   * distinguishable at the server - a MISSING file is a 200 with empty rows and
   * `loaded` true (first run, which must be able to Save), while an unreadable
   * or malformed one is a 500 that leaves `loaded` false. Without that gate a
   * corrupt file would let Save PUT a one-row document over the real one.
   */
  onMount(() => {
    void (async () => {
      try {
        await loadDocument();
      } catch (e) {
        fail(`Could not read the mapping file: ${(e as Error).message}`);
      } finally {
        loading = false;
      }
    })();
    void loadBlockEntries((e) => (blockEntries = e));
  });

  // --- the corpus, as this page needs it -------------------------------------

  /**
   * `isHomebrew` decides whether the official-content warning fires, and the
   * table has no corpus to consult - it hard-codes the field when Edit prefills
   * the boxes. This page does have one, so it corrects the staged chips as soon
   * as the tree is in. A source the corpus has never heard of is left alone
   * rather than being declared official on no evidence.
   */
  function adoptCorpus(sources: SourceSummary[]) {
    const known = new Map(
      sources.map((s) => [s.source.toLowerCase(), s.isHomebrew]),
    );
    const resolve = (p: PickedEntity): PickedEntity => {
      const brew = known.get(p.source.toLowerCase());
      return brew === undefined || brew === p.isHomebrew
        ? p
        : { ...p, isHomebrew: brew };
    };
    picker.newItems = picker.newItems.map(resolve);
    picker.replacedItems = picker.replacedItems.map(resolve);
  }

  // --- staging ---------------------------------------------------------------
  const keyOf = (p: PickedEntity) => itemKey(p.source, p.prop, p.hash);

  /**
   * `page|hash` -> the source whose override rule redirects it. Such an entity
   * is already gone from the site, so offering it as a replacement would build
   * a mapping that lands on something that itself redirects.
   */
  const overriddenBy = $derived.by(() => {
    const out = new Map<string, string>();
    for (const rule of doc.overrides)
      for (const key of rule.keys) out.set(key, rule.from);
    return out;
  });

  const overriderOf = (prop: string, hash: string): string | undefined => {
    const page = propToPage(prop);
    return page ? overriddenBy.get(`${page}|${hash}`) : undefined;
  };

  const stagedKeys = $derived(
    new Set([...picker.newItems, ...picker.replacedItems].map(keyOf)),
  );

  const isStaged = (source: string, prop: string, hash: string) =>
    stagedKeys.has(itemKey(source, prop, hash));

  /**
   * Adds unless the entity is already staged in EITHER box.
   *
   * Same box: staging one thing twice is a slip - `buildManualRows` collapses
   * the duplicate, so the chip would promise something the document does not
   * have.
   *
   * Other box: an entity that is both the original and the replacement builds
   * a row pointing at itself, and nothing downstream refuses it - neither
   * `buildManualRow` nor `mergeRows` looks for self-reference - so the file
   * would carry a redirect loop. The picker is the only layer that can see
   * both sides at once, so the refusal has to live here.
   */
  function stage(
    box: 'new' | 'replaced',
    s: SourceSummary,
    prop: string,
    item: IndexedEntity,
  ) {
    if (isStaged(s.source, prop, item.hash)) return;
    const picked: PickedEntity = {
      source: s.source,
      prop,
      name: item.name,
      hash: item.hash,
      isHomebrew: s.isHomebrew,
    };
    if (box === 'new') picker.newItems = [...picker.newItems, picked];
    else picker.replacedItems = [...picker.replacedItems, picked];
  }

  function remove(box: 'new' | 'replaced', p: PickedEntity) {
    const gone = (list: PickedEntity[]) =>
      list.filter((x) => keyOf(x) !== keyOf(p));
    if (box === 'new') picker.newItems = gone(picker.newItems);
    else picker.replacedItems = gone(picker.replacedItems);
  }

  function swap() {
    const wasNew = picker.newItems;
    picker.newItems = picker.replacedItems;
    picker.replacedItems = wasNew;
  }

  /**
   * Clears the chips but keeps `editingKeys`: emptying the boxes is not
   * abandoning the edit, and losing the keys would turn the next Save from a
   * rewrite into a second, additive mapping.
   */
  function clearBoxes() {
    picker.newItems = [];
    picker.replacedItems = [];
  }

  // --- save ------------------------------------------------------------------
  const toEntityRef = (p: PickedEntity): EntityRef => ({
    name: p.name,
    source: p.source,
    prop: p.prop,
  });

  async function save() {
    banner = null;
    let result: MergeRowsResult;
    try {
      const built = buildManualRows(
        picker.replacedItems.map(toEntityRef),
        picker.newItems.map(toEntityRef),
      );
      // Edit deletes the group it opened before merging, so trimming a chip
      // removes the mapping. Add only ever adds.
      result = editing
        ? replaceGroup(doc.rows, picker.editingKeys, built)
        : mergeRows(doc.rows, built);
    } catch (e) {
      // A build that can't be made is the user's problem to fix in the boxes,
      // not an exception - say which side is wrong and leave the chips alone.
      fail(
        e instanceof SupersessionBuildError
          ? e.message
          : `Could not stage that: ${(e as Error).message}`,
      );
      return;
    }
    doc.rows = result.rows;
    resetPicker();
    await goto('/replacement');
  }

  /** Leaves without staging. The chips go too, or the next Add inherits them. */
  async function cancel() {
    resetPicker();
    await goto('/replacement');
  }

  // --- the blocklist ---------------------------------------------------------

  /**
   * Read-only here, exactly as on the table view. A mapping into or out of
   * blocked content is a dead redirect, so the picker greys those entries and
   * offers to hide them - but content-blocklist.json is only ever authored on
   * its own page. Failing to read it is not fatal; the picker just cannot warn.
   */
  let blockEntries = $state<BlocklistEntry[]>([]);
  let hideBlocked = $state(false);
  const blockIx = $derived(
    blockEntries.length ? buildBlockedIndex(blockEntries) : EMPTY_BLOCKED_INDEX,
  );
  const anyBlocked = $derived(blockEntries.length > 0);

  const entryBlocked = (source: string, prop: string, hash: string): boolean =>
    isEntityBlocked(blockIx, hash, prop, source);

  // A wildcard hash asks the same question one level up: is this whole type, or
  // this whole source, blocked? Without these, hiding blocked entries leaves the
  // empty rows that held them behind.
  const typeBlocked = (source: string, prop: string): boolean =>
    isEntityBlocked(blockIx, '*', prop, source);
  const sourceBlocked = (source: string): boolean =>
    isEntityBlocked(blockIx, '*', '*', source);
</script>

<section class="pick">
  <header class="head">
    <div>
      <h1>{editing ? 'Edit replacement' : 'Add a New Content Replacement'}</h1>
      <p class="meta">
        {#if editing}
          Rewrites {formatNumber(picker.editingKeys.length)}
          {plural(picker.editingKeys.length, 'mapping', 'mappings')} - removing a
          chip removes it.
        {:else}
          Choose both the item(s) you want to replace, and what replaces it.
        {/if}
      </p>
    </div>
    <PickActions
      newItems={picker.newItems}
      replacedItems={picker.replacedItems}
      {editing}
      busy={loading || !doc.loaded}
      onCancel={cancel}
      onSwap={swap}
      onClear={clearBoxes}
      onSave={save}
    />
  </header>

  {#if banner}
    <Banner
      tone={banner.tone}
      text={banner.text}
      ondismiss={() => (banner = null)}
    />
  {/if}

  <PickBoxes
    newItems={picker.newItems}
    replacedItems={picker.replacedItems}
    onRemove={remove}
  />

  <div class="browser">
    <SourceBrowser
      title="Search for sources or items"
      dataPath={data.dataPath}
      indexWarm={data.indexWarm}
      columns={PICKER_COLUMNS}
      defaultSort="name"
      sourceFilter={(s) => !hideBlocked || !sourceBlocked(s.source)}
      typeFilter={(s, t) => !hideBlocked || !typeBlocked(s.source, t.prop)}
      itemFilter={(source, prop, item) =>
        !hideBlocked || !entryBlocked(source, prop, item.hash)}
      sourceTone={(s) => (sourceBlocked(s.source) ? 'blocklisted' : null)}
      typeTone={(s, t) =>
        typeBlocked(s.source, t.prop) ? 'blocklisted' : null}
      itemTone={(source, prop, item) =>
        entryBlocked(source, prop, item.hash)
          ? 'blocklisted'
          : isStaged(source, prop, item.hash) || overriderOf(prop, item.hash)
            ? 'blocked'
            : null}
      onSources={({ sources }) => adoptCorpus(sources)}
      onError={fail}
    >
      {#snippet filterControls()}
        <label
          class="toggle"
          title={anyBlocked
            ? 'Hide anything content-blocklist.json already blocks - a mapping into or out of it is a dead redirect'
            : 'Nothing is blocked in content-blocklist.json'}
        >
          <input
            type="checkbox"
            bind:checked={hideBlocked}
            disabled={!anyBlocked}
          />
          Hide blocked items
        </label>
      {/snippet}

      <!-- The affordance is these buttons, not a clickable row: a row that is
           itself a button cannot hold two, and one box would have to win.

           BOTH go dead once the entity is staged anywhere, not just the box
           holding it - an entity in both boxes is a mapping that redirects to
           itself, and no layer below this one would refuse it. -->
      <!-- A whole type at once: this source's copy wins over every
           same-named one elsewhere. Only types with a list page can be
           redirected, so the rest get no button. -->
      {#snippet typeActions(s, t)}
        {#if isSupersedableProp(t.prop)}
          {@const ruled = doc.overrides.some(
            (r) => r.id === overrideId(t.prop, s.source),
          )}
          <Button
            size="small"
            title={ruled
              ? `Edit the rule making ${s.source} ${t.label.toLowerCase()} win over same-named ones elsewhere`
              : `Make ${s.source} ${t.label.toLowerCase()} replace every same-named one in other sources`}
            onclick={() =>
              goto(
                `/replacement/override?source=${encodeURIComponent(s.source)}&prop=${encodeURIComponent(t.prop)}`,
              )}>{ruled ? 'Edit override' : 'Override duplicates'}</Button
          >
        {/if}
      {/snippet}

      {#snippet itemActions(s, t, item)}
        {@const inNew = picker.newItems.some(
          (p) => keyOf(p) === itemKey(s.source, t.prop, item.hash),
        )}
        {@const inOld = picker.replacedItems.some(
          (p) => keyOf(p) === itemKey(s.source, t.prop, item.hash),
        )}
        {@const winner = overriderOf(t.prop, item.hash)}
        {@const held = inNew
          ? 'Already staged as a new item - remove its chip to stage it as the replaced item instead'
          : inOld
            ? 'Already staged as a replaced item - remove its chip to stage it as the new item instead'
            : ''}
        <Button
          size="small"
          disabled={inNew || inOld || !!winner}
          title={winner
            ? `Overridden by ${winner}'s ${item.name} - the site already redirects this one there, so pick that copy instead`
            : held || `Stage ${item.name} as the replacement`}
          onclick={() => stage('new', s, t.prop, item)}
          >{winner ? `Overridden` : 'Keep this'}</Button
        >
        <Button
          size="small"
          disabled={inNew || inOld}
          title={held || `Stage ${item.name} as the original being superseded`}
          onclick={() => stage('replaced', s, t.prop, item)}
          >Replace this</Button
        >
      {/snippet}
    </SourceBrowser>
  </div>
</section>

<style>
  /* height:100vh plus min-height:0 on every child is what lets the tree scroll
     on its own instead of pushing the staging boxes off the top of the page. */
  .pick {
    height: 100vh;
    min-height: 0;
    padding-block: 1.75rem;
    padding-inline: 2rem;
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .head h1 {
    margin: 0 0 0.25rem;
    font-size: var(--text-2xl);
  }
  .meta {
    margin: 0 0 0.875rem;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  /* Matches the Blocklist's toggle, since both sit in the tree's filter row. */
  .toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--text-xs);
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    padding: 0 0.25rem;
  }
  .toggle:has(input:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  /* A grid, so SourceBrowser's own .pane stretches to the row and scrolls
     inside itself - the same bargain the Blocklist's two-pane grid makes. */
  .browser {
    flex: 1;
    min-height: 0;
    display: grid;
  }

  @media (max-width: 860px) {
    .pick {
      height: auto;
    }
  }
</style>
