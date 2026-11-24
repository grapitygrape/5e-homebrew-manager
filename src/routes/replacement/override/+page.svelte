<!--
  /replacement/override?source=&prop= - one source override rule.

  "For this content type, `source`'s copy wins over every same-named one in
  the sources ticked here." Opened from the picker's Override duplicates (or a
  rule row's Edit), and like the picker it only stages: Save puts the rule in
  the shared document and returns to the table, whose Save writes the file.

  Defaults to every source with a match, because the duplicates you came here
  about are usually all of them. An existing rule's choices win over that.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import OverrideTargets, {
    type NamedTarget,
  } from '$lib/components/replacement/OverrideTargets.svelte';
  import { overrideId, rowKey } from '$lib/engine/supersession';
  import { propLabel } from '$lib/engine/blocklist';
  import { doc, loadDocument } from '$lib/state/supersessions.svelte.ts';
  import { formatNumber, plural } from '$lib/util';
  import { getOverrideTargets } from '$lib/api';

  const source = $derived(page.url.searchParams.get('source') ?? '');
  const prop = $derived(page.url.searchParams.get('prop') ?? '');
  const label = $derived(propLabel(prop));
  const id = $derived(overrideId(prop, source));

  let loading = $state(true);
  let error = $state<string | null>(null);
  let targets = $state<NamedTarget[]>([]);
  let selected = $state(new Set<string>());
  let excluded = $state(new Set<string>());

  const existing = $derived(doc.overrides.find((r) => r.id === id));
  const handKeys = $derived(new Set(doc.rows.map(rowKey)));

  onMount(async () => {
    try {
      await loadDocument();
      targets = await getOverrideTargets(source, prop);
      const rule = doc.overrides.find((r) => r.id === id);
      selected = new Set(
        (rule ? rule.targets : targets.map((t) => t.source)).map((s) =>
          s.toLowerCase(),
        ),
      );
      excluded = new Set(rule?.exclude ?? []);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  });

  function toggleSource(code: string) {
    const key = code.toLowerCase();
    const target = targets.find((t) => t.source === code);
    const nextSelected = new Set(selected);
    const nextExcluded = new Set(excluded);
    const live = target
      ? target.matches.some((m) => !excluded.has(m.key) && !handKeys.has(m.key))
      : false;
    // A source ticked with everything in it unticked reads as off, so a
    // click on it turns it back on rather than off a second time.
    if (selected.has(key) && live) nextSelected.delete(key);
    else nextSelected.add(key);
    for (const m of target?.matches ?? []) nextExcluded.delete(m.key);
    selected = nextSelected;
    excluded = nextExcluded;
  }

  /** Wholly on or off: a bulk tick also clears that source's unticked entries. */
  function setSources(codes: string[], on: boolean) {
    const nextSelected = new Set(selected);
    const nextExcluded = new Set(excluded);
    for (const code of codes) {
      if (on) nextSelected.add(code.toLowerCase());
      else nextSelected.delete(code.toLowerCase());
      const target = targets.find((t) => t.source === code);
      for (const m of target?.matches ?? []) nextExcluded.delete(m.key);
    }
    selected = nextSelected;
    excluded = nextExcluded;
  }

  function toggleMatch(key: string) {
    const next = new Set(excluded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    excluded = next;
  }

  /** Mappings Save would produce: ticked, not unticked, not held by hand. */
  const total = $derived(
    targets.reduce(
      (n, t) =>
        selected.has(t.source.toLowerCase())
          ? n +
            t.matches.filter(
              (m) => !excluded.has(m.key) && !handKeys.has(m.key),
            ).length
          : n,
      0,
    ),
  );

  function save() {
    const chosen = targets.filter((t) => selected.has(t.source.toLowerCase()));
    // Only keys inside a chosen source mean anything; drop the rest so the
    // file doesn't collect exclusions for sources the rule no longer reaches.
    const inChosen = new Set(
      chosen.flatMap((t) => t.matches.map((m) => m.key)),
    );
    const rule = {
      id,
      prop,
      from: source,
      targets: chosen.map((t) => t.source),
      exclude: [...excluded].filter((k) => inChosen.has(k)),
      rowCount: total,
      keys: chosen.flatMap((t) =>
        t.matches
          .filter((m) => !excluded.has(m.key) && !handKeys.has(m.key))
          .map((m) => m.key),
      ),
      missing: false,
    };
    doc.overrides = [...doc.overrides.filter((r) => r.id !== id), rule];
    void goto('/replacement');
  }
</script>

<section class="override">
  <header class="head">
    <div>
      <h1>Manage Overrides for <span class="source-name">{source} {label}</span></h1>
      <p class="meta">
        {formatNumber(total)}
        {plural(total, 'replacement', 'replacements')} &middot; {source}'s {label.toLowerCase()} replace every item with the same name in the sources chosen below.
      </p>
    </div>
    <div class="actions">
      <Button
        onclick={() => goto(existing ? '/replacement' : '/replacement/pick')}
        >Cancel</Button
      >
      <Button
        variant="primary"
        disabled={loading || !total}
        title={total ? undefined : 'Pick at least one source to override'}
        onclick={save}>{existing ? 'Update rule' : 'Add rule'}</Button
      >
    </div>
  </header>

  {#if error}
    <Banner tone="error" text={error} ondismiss={() => (error = null)} />
  {/if}

  {#if loading}
    <p class="muted">
      Matching {label.toLowerCase()} by name across every source.
    </p>
  {:else if !targets.length}
    <p class="muted">
      Nothing in other sources shares a name with {source}'s {label.toLowerCase()}.
    </p>
  {:else}
    <div class="pane">
      <OverrideTargets
        {targets}
        {selected}
        {excluded}
        {handKeys}
        onToggleSource={toggleSource}
        onToggleMatch={toggleMatch}
        onSetSources={setSources}
      />
    </div>
  {/if}
</section>

<style>
  .override {
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
  .actions {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }
  .muted {
    color: var(--text-muted);
  }
  .pane {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    max-width: 56rem;
  }
</style>
