<!--
  SourceBrowser - the corpus, as a tree you can filter and open.

  WHAT IT OWNS
    Loading `/api/blocklist/sources`, the filter row (one search box and one
    content type), the sort header, expand state, lazy-loading a type's
    entries, and the row budget that keeps a two-thousand-row category view
    from drawing forty thousand nodes.

  WHAT IT DOESN'T
    Any opinion about what a row MEANS. Hide Content hangs a tri-state
    checkbox off every row and greys out what a broader rule covers; Content
    Replacement makes rows clickable and highlights a selection. Both are the
    caller's business, supplied as snippets (`sourceLead`, `itemLead`, .) and
    predicates (`itemFilter`, `itemTone`). The tree does not know which page it
    is on.

  WHY A COMPONENT AND NOT A COPY
    Four hundred lines of fetch/filter/budget logic, and the two pages have to
    agree about what "the corpus" looks like - a source that is visible on one
    and missing on the other is a bug report waiting to happen.

  ONE SEARCH BOX, AND IT OWNS THE PANEL. It matches source abbreviations and
  titles locally and entry names through the server, expanding to what it found.
  There were once two boxes - one for cards, one for entries inside types you
  had already opened - and knowing which was which was the reader's problem.
  A page above the tree cannot do this instead: its box narrows what the tree
  was handed without saying so, and the two disagree about what "9 matches"
  means.

  REMEMBERED BETWEEN VISITS. The corpus and every type's entries opened so far
  live in the page cache, shared by every page that draws this tree. A revisit
  draws them at once and re-reads the corpus behind it; if that comes back
  different, the remembered entries are dropped and open types re-read.

  THE FILTER ROW IS THE SAME EVERYWHERE. Search, type, and the page's own
  "hide blocked" - supplied as `filterControls`, because that phrase means
  different things on the Blocklist and on the Replacement pages.

  PIECES. source-browser/SourceBrowserToolbar.svelte draws the head (filter
  row, column header); source-browser/SourceRow.svelte one source's card; the
  pure sorting, matching and column logic is in source-browser.ts.
-->
<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { propLabel, allocateRowBudget } from '$lib/engine/blocklist';
  import StatusText from '$lib/ui/StatusText.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { formatNumber } from '$lib/util';
  import {
    getBlocklistSources,
    getItemsByType,
    getSourceItems,
    searchBlocklistEntities,
  } from '$lib/api';
  import {
    itemKey,
    typeKey,
    categoryOptions,
    columnLayout,
    nextSort,
    searchNote as describeSearch,
    sortSources,
    sourceMatches,
    DEFAULT_COLUMNS,
    type ColumnKey,
    type CorpusMeta,
    type IndexedEntity,
    type ItemPick,
    type RowHooks,
    type RowTone,
    type SortKey,
    type SourceSort,
    type SourceSummary,
    type SourceTypeCount,
  } from './source-browser.ts';
  import {
    forget,
    peek,
    remember,
    tracked,
  } from '$lib/state/page-cache.svelte.ts';
  import SourceBrowserToolbar from './source-browser/SourceBrowserToolbar.svelte';
  import SourceRow from './source-browser/SourceRow.svelte';

  interface Props {
    title?: string;
    /**
     * Extra controls in the filter row, beside the search box and the type
     * select - in practice, each page's "hide blocked" toggle.
     *
     * Caller-supplied because "blocked" is not one idea: on the Blocklist it
     * means covered by the rules you are authoring, on the Replacement pages it
     * means hidden by content-blocklist.json. The tree owns WHERE the control
     * sits, so every page reads the same; it does not own what it means.
     */
    filterControls?: Snippet;
    /** Where the data root lives, for the cold-scan hint. */
    dataPath?: string;
    /** False when the server's index still has to be built. */
    indexWarm?: boolean;
    /** Drop a source from the list entirely. */
    sourceFilter?: (s: SourceSummary) => boolean;
    /** Which of a source's types to show. */
    typeFilter?: (s: SourceSummary, t: SourceTypeCount) => boolean;
    /** Drop individual entries. Applied before the row budget. */
    itemFilter?: (source: string, prop: string, item: IndexedEntity) => boolean;
    /**
     * Pre-resolved entries supplied by the caller (e.g. an orphan audit view)
     * so matching types can display immediately without polluting `itemCache`.
     */
    pinnedItems?: IndexedEntity[];
    /** Row shading, per level. */
    sourceTone?: (s: SourceSummary) => RowTone;
    typeTone?: (s: SourceSummary, t: SourceTypeCount) => RowTone;
    itemTone?: (source: string, prop: string, item: IndexedEntity) => RowTone;
    /**
     * Which columns to draw, in order - the array is the header, left to right.
     * The Blocklist takes the default, which is what it has always drawn.
     */
    columns?: readonly ColumnKey[];
    /**
     * Trailing per-entry controls. Draws the `actions` column when supplied.
     *
     * Drawn on rows the tree owns - `itemLead` rows and plain rows. It is not
     * drawn on `onPickItem` rows, whose row IS a button: buttons cannot nest.
     */
    itemActions?: Snippet<[SourceSummary, SourceTypeCount, IndexedEntity]>;
    /** Buttons on a content-type row, drawn in the `actions` column. */
    typeActions?: Snippet<[SourceSummary, SourceTypeCount]>;
    /** Leading control on a row - a checkbox, or nothing. */
    sourceLead?: Snippet<[SourceSummary]>;
    typeLead?: Snippet<[SourceSummary, SourceTypeCount]>;
    itemLead?: Snippet<[SourceSummary, SourceTypeCount, IndexedEntity]>;
    /** Count column for a source row. Defaults to `s.total`. */
    sourceCount?: Snippet<[SourceSummary]>;
    /** Count column for a type row. Defaults to `t.count`. */
    typeCount?: Snippet<[SourceSummary, SourceTypeCount]>;
    /** Set to make entries clickable. Ignored when `itemLead` is supplied. */
    onPickItem?: (pick: ItemPick) => void;
    /** Entries to draw as picked. Keys from `itemKey()`. */
    selectedKeys?: Set<string>;
    /** Called once the corpus is in, so the caller can keep its own copy. */
    onSources?: (info: { sources: SourceSummary[]; meta: CorpusMeta }) => void;
    onError?: (message: string) => void;
    /** Why a source shows no types at all. */
    noTypesMessage?: (s: SourceSummary) => string;
    /** Why nothing matched. `query` is the trimmed source search. */
    noMatchMessage?: (ctx: { query: string; total: number }) => string;
    /**
     * Collapsed source list starts sorted by this column. `name` is the full
     * title; `source` is the abbreviation. The picker wants title; the
     * Blocklist keeps abbreviation, which is the default.
     */
    defaultSort?: 'source' | 'name' | 'dateAdded' | 'total';
  }

  let {
    title = 'Allowed sources',
    filterControls,
    dataPath = '',
    indexWarm = true,
    sourceFilter,
    typeFilter,
    itemFilter,
    pinnedItems,
    sourceTone,
    typeTone,
    itemTone,
    columns = DEFAULT_COLUMNS,
    itemActions,
    typeActions,
    sourceLead,
    typeLead,
    itemLead,
    sourceCount,
    typeCount,
    onPickItem,
    selectedKeys,
    onSources,
    onError,
    noTypesMessage,
    noMatchMessage,
    defaultSort = 'source',
  }: Props = $props();

  /** Which columns to draw and where the chevrons go. See columnLayout(). */
  const layout = $derived(
    columnLayout(columns, Boolean(itemActions || typeActions)),
  );

  /** The caller's per-row hooks, handed to every SourceRow unchanged. */
  const hooks: RowHooks = $derived({
    sourceTone,
    typeTone,
    itemTone,
    itemActions,
    typeActions,
    sourceLead,
    typeLead,
    itemLead,
    sourceCount,
    typeCount,
    onPickItem,
    selectedKeys,
    noTypesMessage,
  });

  let sources = $state<SourceSummary[]>([]);
  let corpusMeta = $state<CorpusMeta | null>(null);
  let loadingCorpus = $state(true);

  /**
   * The one search box. Matches a source's abbreviation or title locally, and
   * entry names across the whole corpus through the server - see the hits
   * section below for why the entry half cannot be done here.
   */
  let query = $state('');
  let activeSource = $state<string | null>(null);
  let openSources = $state<Set<string>>(new Set());
  let openTypes = $state<Set<string>>(new Set());
  // Raw: every write replaces the object, and it outlives this component in
  // the page cache.
  let itemCache = $state.raw<Record<string, IndexedEntity[]>>({
    ...peek<Record<string, IndexedEntity[]>>('corpus-items'),
  });
  let itemLoading = $state<Set<string>>(new Set());

  const ITEM_RENDER_CAP = 300;

  const fail = (message: string) => onError?.(message);

  const CORPUS_KEY = 'corpus';
  const ITEMS_KEY = 'corpus-items';
  type Corpus = { sources: SourceSummary[]; meta: CorpusMeta };

  function applyCorpus(next: Corpus) {
    sources = next.sources;
    corpusMeta = next.meta;
    onSources?.(next);
  }

  async function loadCorpus() {
    const remembered = peek<Corpus>(CORPUS_KEY);
    if (remembered) applyCorpus(remembered);
    loadingCorpus = !remembered;
    try {
      const read = getBlocklistSources();
      const body = await (remembered ? tracked(read) : read);
      const next: Corpus = {
        sources: body.sources,
        meta: {
          entityCount: body.entityCount,
          duplicateEntities: body.duplicateEntities,
          fileCount: body.fileCount,
          skipped: body.skipped,
        },
      };
      const same =
        remembered && JSON.stringify(remembered) === JSON.stringify(next);
      if (same) return;
      remember(CORPUS_KEY, next);
      applyCorpus(next);
      if (remembered) {
        // Content changed on disk, so the remembered entries may be wrong.
        forget(ITEMS_KEY);
        itemCache = {};
        for (const key of openTypes) {
          const [source, prop] = key.split('|');
          void ensureItems(source, prop);
        }
      }
    } catch (e) {
      fail(`Could not index your content: ${(e as Error).message}`);
    } finally {
      loadingCorpus = false;
    }
  }

  /**
   * Keeps full entry lists for the next visit. Only full ones: search hits
   * also land in `itemCache`, but as a partial list for their type.
   */
  function rememberItems(lists: Record<string, IndexedEntity[]>) {
    remember(ITEMS_KEY, {
      ...peek<Record<string, IndexedEntity[]>>(ITEMS_KEY),
      ...lists,
    });
  }

  // One-shot: the corpus scan can be slow, and re-running it on any state
  // change would be a self-inflicted denial of service.
  onMount(() => {
    void loadCorpus();
  });

  // --- the category filter ---------------------------------------------------

  /**
   * Pick one content type and the list becomes that type across every source
   * that has it, entries already open. Clearing it returns to the plain
   * type-level view - the same shape the header's expand-all button gives.
   */
  let categoryProp = $state('');
  let loadingCategory = $state(false);

  /** Rows drawn before Load more. See engine/blocklist/budget.ts. */
  const CATEGORY_PAGE = 2000;
  let categoryBudget = $state(CATEGORY_PAGE);

  /** Every type in the corpus, for the type select. See categoryOptions(). */
  const categories = $derived(categoryOptions(sources));

  export async function pickCategory(prop: string) {
    categoryProp = prop;
    categoryBudget = CATEGORY_PAGE;

    if (!prop) {
      // Back to exactly what expand-all produces.
      openTypes = new Set();
      openSources = new Set(visibleSources.map((s) => s.source));
      return;
    }

    loadingCategory = true;
    try {
      const bySource = await getItemsByType(prop);

      // Merge rather than replace: single-type expansions already cached stay valid.
      const lists: Record<string, IndexedEntity[]> = {};
      for (const [source, items] of Object.entries(bySource)) {
        lists[typeKey(source, prop)] = items;
      }
      itemCache = { ...itemCache, ...lists };
      rememberItems(lists);

      const holders = sources.filter((s) =>
        s.types.some((t) => t.prop === prop),
      );
      openSources = new Set(holders.map((s) => s.source));
      openTypes = new Set(holders.map((s) => typeKey(s.source, prop)));
    } catch (e) {
      fail(`Could not load ${propLabel(prop)}: ${(e as Error).message}`);
      categoryProp = '';
    } finally {
      loadingCategory = false;
    }
  }

  // --- searching -------------------------------------------------------------

  /**
   * ONE BOX, TWO HALVES. Source abbreviations and titles are already in memory,
   * so those match locally. Entry names are not: the corpus holds hundreds of
   * thousands of them and one type alone is about a megabyte, so entries are
   * matched by the server and the tree is handed the hits.
   *
   * `null` means no search is narrowing anything, and makes every hit filter
   * below a no-op - the state the tree sits in until someone types.
   */
  let hitKeys = $state<Set<string> | null>(null);

  const MIN_QUERY_CHARS = 2;
  const SEARCH_DEBOUNCE_MS = 200;

  let searching = $state(false);
  let searchNote = $state('');

  /**
   * Which request owns the tree. Debounced keystrokes overlap, and a slow early
   * one landing last would show the wrong hits with no way to tell.
   * Deliberately not `$state` - nothing renders it.
   */
  let searchSeq = 0;

  /**
   * Whether the tree is currently showing hits. Clearing collapses it, so doing
   * that when nothing is filtered would fold up a tree the reader opened by
   * hand - including on the empty query the effect fires at mount.
   */
  let hitsShown = false;

  async function runSearch(q: string, prop: string): Promise<void> {
    const seq = ++searchSeq;
    if (q.length < MIN_QUERY_CHARS) {
      searching = false;
      searchNote = '';
      if (hitsShown) {
        hitsShown = false;
        clearHits();
      }
      return;
    }
    searching = true;
    try {
      const body = await searchBlocklistEntities(q, {
        type: prop || undefined,
      });
      if (seq !== searchSeq) return;
      await showHits(body.hits);
      hitsShown = true;
      searchNote = describeSearch(q, {
        shown: body.hits.length,
        total: body.total,
        truncated: body.truncated,
      });
    } catch (e) {
      if (seq === searchSeq) {
        searchNote = '';
        fail(`Search failed: ${(e as Error).message}`);
      }
    } finally {
      if (seq === searchSeq) searching = false;
    }
  }

  /**
   * Debounced, and driven by an effect rather than `oninput` because the box's
   * own clear button sets the value without firing one - and an emptied box has
   * to put the whole tree back.
   */
  $effect(() => {
    const q = query.trim();
    // The BOX drives this effect; the select drives `pickType`, which runs the
    // search itself. Reading `categoryProp` normally would make changing the
    // select fire both, for two requests answering one question.
    const prop = untrack(() => categoryProp);
    const timer = setTimeout(() => void runSearch(q, prop), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  const searchHint = $derived.by(() => {
    const q = query.trim();
    if (searching) return 'Searching.';
    if (q.length && q.length < MIN_QUERY_CHARS)
      return `Type at least ${MIN_QUERY_CHARS} characters.`;
    return searchNote;
  });

  /**
   * The type select does double duty, because it reads as one control and
   * should behave as one. With a search running it scopes that search; with the
   * box empty it is the category filter - that type across every source, open.
   */
  async function pickType(prop: string): Promise<void> {
    if (query.trim().length >= MIN_QUERY_CHARS) {
      categoryProp = prop;
      await runSearch(query.trim(), prop);
      return;
    }
    await pickCategory(prop);
  }

  async function showHits(hits: IndexedEntity[]): Promise<void> {
    const merged = { ...itemCache };
    const bySourceType = new Map<string, IndexedEntity[]>();
    for (const hit of hits) {
      const key = typeKey(hit.source, hit.prop);
      const list = bySourceType.get(key) ?? [];
      list.push(hit);
      bySourceType.set(key, list);
    }
    for (const [key, list] of bySourceType) {
      if (!merged[key]) merged[key] = list;
    }
    itemCache = merged;
    hitKeys = new Set(hits.map((h) => itemKey(h.source, h.prop, h.hash)));
    openSources = new Set(hits.map((h) => h.source));
    openTypes = new Set(bySourceType.keys());
  }

  function clearHits(): void {
    hitKeys = null;
    openSources = new Set();
    openTypes = new Set();
  }

  // --- sorting ---------------------------------------------------------------
  let sort = $state<SourceSort>({
    key: untrack(() => defaultSort),
    dir: 'asc',
  });
  const sortBy = (key: SortKey) => (sort = nextSort(sort, key));

  /**
   * Sources whose abbreviation or title contains the search. Matched here, not
   * by the server: titles never reach it, and a source's entries counted as
   * hits would spend the hit cap on one book.
   */
  const nameMatched = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(
      sources.filter((s) => sourceMatches(s, q)).map((s) => s.source),
    );
  });

  /** Sources after the caller's filter and the search, in sort order. */
  const visibleSources = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = sources.filter((s) => {
      if (sourceFilter && !sourceFilter(s)) return false;
      // A source without the chosen category would only draw an empty card.
      if (categoryProp && !s.types.some((t) => t.prop === categoryProp))
        return false;
      // Once a search is running, a source shows when its own abbreviation or
      // title matches (drawn whole) or when the server found entries in it.
      if (hitKeys)
        return nameMatched.has(s.source) || visibleTypes(s).length > 0;
      // Below the search threshold there are no hits to go on, so a short
      // string still narrows the cards it plainly matches.
      if (!q) return true;
      return sourceMatches(s, q);
    });
    return sortSources(list, sort);
  });

  function visibleTypes(s: SourceSummary): SourceTypeCount[] {
    // A chosen category IS the view - show that type alone, filtered or not.
    let list: SourceTypeCount[];
    if (categoryProp) list = s.types.filter((t) => t.prop === categoryProp);
    else if (!typeFilter) list = s.types;
    else list = s.types.filter((t) => typeFilter(s, t));
    // In hits mode an empty type would only draw a heading over nothing - but a
    // source matched by its own name is drawn whole, entries not loaded yet included.
    if (hitKeys && !nameMatched.has(s.source))
      list = list.filter((t) => filteredItems(s.source, t.prop).length > 0);
    return list;
  }

  const sourceLabelByLower = $derived(
    new Map(sources.map((s) => [s.source.toLowerCase(), s.source])),
  );

  const pinnedByKey = $derived.by(() => {
    const map = new Map<string, IndexedEntity[]>();
    if (!pinnedItems?.length) return map;
    for (const item of pinnedItems) {
      const src =
        sourceLabelByLower.get(item.source.toLowerCase()) ?? item.source;
      const key = typeKey(src, item.prop);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  });

  /** Entries of one source+type after the text filter and the caller's filter. */
  function filteredItems(source: string, prop: string): IndexedEntity[] {
    const key = typeKey(source, prop);
    let all = itemCache[key] ?? pinnedByKey.get(key) ?? [];
    if (itemFilter) all = all.filter((i) => itemFilter(source, prop, i));
    const hits = hitKeys;
    if (hits && !nameMatched.has(source))
      all = all.filter((i) => hits.has(itemKey(source, prop, i.hash)));
    return all;
  }

  /**
   * In category mode the row budget is spread across sources in display order,
   * so "the first 2,000 rows" means the first 2,000 you would actually scroll
   * past. Outside category mode each type keeps its own flat cap.
   */
  const categoryBudgeting = $derived.by(() =>
    allocateRowBudget(
      categoryProp
        ? visibleSources.map((s) => ({
            key: s.source,
            size: filteredItems(s.source, categoryProp).length,
          }))
        : [],
      categoryBudget,
    ),
  );

  function visibleItems(
    source: string,
    prop: string,
  ): { rows: IndexedEntity[]; total: number } {
    const all = filteredItems(source, prop);
    const cap =
      categoryProp === prop
        ? (categoryBudgeting.taken.get(source) ?? 0)
        : ITEM_RENDER_CAP;
    return { rows: all.slice(0, cap), total: all.length };
  }

  /** True while any source currently in view is open - drives the header chevron. */
  const anyOpen = $derived(
    visibleSources.some((s) => openSources.has(s.source)),
  );

  /**
   * Expand or collapse every source in view, stopping at the type level.
   *
   * Expanding clears `openTypes` rather than leaving it alone: the point of the
   * control is "show me every source's content types", and a type left open
   * from earlier would sit in that uniform list with its entries spilled out.
   * Stopping here also keeps the action free - types load their entries lazily,
   * so nothing is fetched.
   */
  function toggleAll() {
    if (anyOpen) {
      openSources = new Set();
      openTypes = new Set();
      return;
    }
    openSources = new Set(visibleSources.map((s) => s.source));
    // Under a category filter, re-expanding restores that view rather than
    // dropping to type level - the category is what you asked to look at.
    openTypes = categoryProp
      ? new Set(visibleSources.map((s) => typeKey(s.source, categoryProp)))
      : new Set();
  }

  function toggleSource(source: string) {
    const next = new Set(openSources);
    if (next.has(source)) next.delete(source);
    else next.add(source);
    openSources = next;
    activeSource = source;
  }

  /**
   * The entries of one source + type, fetched once and cached. Returns null if
   * the fetch failed (the caller's banner already says why). Exported because
   * un-blocking needs the full sibling list to expand a wildcard rule.
   */
  export async function ensureItems(
    source: string,
    prop: string,
  ): Promise<IndexedEntity[] | null> {
    const key = typeKey(source, prop);
    const have = itemCache[key];
    if (have) return have;

    itemLoading = new Set(itemLoading).add(key);
    try {
      const items = await getSourceItems(source, prop);
      itemCache = { ...itemCache, [key]: items };
      rememberItems({ [key]: items });
      return items;
    } catch (e) {
      fail(
        `Could not load ${propLabel(prop)} for ${source}: ${(e as Error).message}`,
      );
      return null;
    } finally {
      const done = new Set(itemLoading);
      done.delete(key);
      itemLoading = done;
    }
  }

  async function toggleType(source: string, prop: string) {
    const key = typeKey(source, prop);
    const next = new Set(openTypes);
    if (next.has(key)) {
      next.delete(key);
      openTypes = next;
      return;
    }
    next.add(key);
    openTypes = next;
    await ensureItems(source, prop);
  }

  /** Expand every source and type touched by `items` without mutating itemCache. */
  export function openFor(items: IndexedEntity[]): void {
    const srcs = new Set<string>();
    const types = new Set<string>();
    for (const item of items) {
      const src =
        sourceLabelByLower.get(item.source.toLowerCase()) ?? item.source;
      srcs.add(src);
      types.add(typeKey(src, item.prop));
    }
    openSources = srcs;
    openTypes = types;
  }

  /** Collapse every open source and type. */
  export function collapseAll(): void {
    openSources = new Set();
    openTypes = new Set();
  }

  /** Every entry of one type that is currently cached, for callers that bulk-select. */
  export const cachedItems = (source: string, prop: string): IndexedEntity[] =>
    filteredItems(source, prop);

  export const loadedSources = (): SourceSummary[] => sources;
</script>

<div class="pane">
  <SourceBrowserToolbar
    {title}
    bind:query
    bind:categoryProp
    categoryOptions={categories}
    {loadingCategory}
    hasSources={sources.length > 0}
    {filterControls}
    {searchHint}
    leadBox={Boolean(sourceLead)}
    {layout}
    {sort}
    onSort={sortBy}
    {anyOpen}
    onToggleAll={toggleAll}
    onPickType={pickType}
  />

  {#if loadingCorpus}
    <p class="muted">
      Indexing your content.
      {#if !indexWarm && dataPath}<br /><span class="hint"
          >First run scans <code>{dataPath}</code> and can take a few seconds.</span
        >{/if}
    </p>
  {:else if sources.length === 0}
    <p class="muted">
      No content found. Check the data path in <a href="/settings">Settings</a>.
    </p>
  {:else}
    {#each visibleSources as s (s.source)}
      <SourceRow
        {s}
        {layout}
        {hooks}
        isOpen={openSources.has(s.source)}
        active={s.source === activeSource}
        types={visibleTypes(s)}
        {openTypes}
        {itemLoading}
        itemsFor={(prop) => visibleItems(s.source, prop)}
        query={query.trim()}
        {categoryProp}
        onToggleSource={() => toggleSource(s.source)}
        onToggleType={(prop) => toggleType(s.source, prop)}
      />
    {:else}
      <p class="muted">
        {noMatchMessage?.({
          query: query.trim(),
          total: sources.length,
        }) ?? `Nothing matches "${query.trim()}".`}
      </p>
    {/each}
  {/if}

  {#if categoryProp && categoryBudgeting.truncated}
    <div class="load-more">
      <Button onclick={() => (categoryBudget += CATEGORY_PAGE)}>
        Load {formatNumber(
          Math.min(
            CATEGORY_PAGE,
            categoryBudgeting.total - categoryBudgeting.shown,
          ),
        )} more ({formatNumber(
          categoryBudgeting.total - categoryBudgeting.shown,
        )} of {formatNumber(categoryBudgeting.total)} not shown)
      </Button>
    </div>
  {/if}

  {#if corpusMeta}
    <p class="hint corpus-meta">
      {#if query.trim()}{formatNumber(visibleSources.length)} of {formatNumber(
          sources.length,
        )} sources{:else}{formatNumber(sources.length)} sources{/if}
      &middot; {formatNumber(corpusMeta.entityCount)} entries &middot; {formatNumber(
        corpusMeta.fileCount,
      )} files
      {#if corpusMeta.duplicateEntities}
        &middot; <span
          title="Entities sharing a name and source with another in the same file - one rule covers both, so they show as one row."
          >{formatNumber(corpusMeta.duplicateEntities)} duplicate entries merged</span
        >
      {/if}
      {#if corpusMeta.skipped.length}&middot; <StatusText variant="warning"
          >{formatNumber(corpusMeta.skipped.length)} file(s) unreadable</StatusText
        >{/if}
    </p>
  {/if}
</div>

<style>
  .pane {
    /* The fixed column widths, declared once so a header cell and the row cell
       under it cannot drift apart. Read by SourceBrowserToolbar's header
       cells and SourceRow's row cells. */
    --col-abbr-width: 12ch;
    --col-tags-width: 13ch;
    --col-added-width: 11ch;
    --col-count-width: 11ch;
    --col-actions-width: 23ch;

    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-panel);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 0 0.875rem 0.875rem;
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding: 0.625rem 0 0.25rem;
  }

  .muted {
    color: var(--text-faint);
    font-size: var(--text-sm);
  }
  .hint {
    margin: 0.375rem 0 0;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
  .corpus-meta {
    margin-top: 0.625rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--border);
  }
</style>
