<!--
  components/replacement/MappingTable.svelte - the Replacements table.

  ONE TABLE, FOUR ROW KINDS
    Override rules, mapped groups, review notes and rescan suggestions are the
    same two
    columns with different badges and different actions, so they share a table
    rather than stacking three lists a reader has to correlate by eye.

  THE COLUMNS ARE AN ORDER, NOT A MEANING
    `swapped` flips which side is drawn first; it does NOT change what a side
    holds. The `new` column is always the replacements and the `old` column
    always the originals, so the strike-through and the review note stay
    attached to the entity they describe however the table is turned. Regrouping is the page's half of the swap - see groupByReplacement.

  BLOCKED IS PER-END
    A mapping dead at one end outlines the whole row (nobody can use it) but
    strikes only the end that is actually blocked. Striking a whole cell would
    claim a live homebrew item is blocked because the official spell it
    replaces is.
-->
<script lang="ts">
  import Badge from '$lib/ui/Badge.svelte';
  import Button from '$lib/ui/Button.svelte';
  import {
    isEntityBlocked,
    isUidBlocked,
    describeBlock,
    type BlockedIndex,
  } from '$lib/components/replacement/blocked.ts';
  import { rowKey, suggestionId, unpackUid } from '$lib/engine/supersession';
  import { propLabel } from '$lib/engine/blocklist';
  import { formatNumber } from '$lib/util';
  import SourceTag from '$lib/components/SourceTag.svelte';
  import type {
    LoadedOverride,
    MappingGroup,
    ReplacedByRef,
    ReviewItem,
    Suggestion,
    SupersessionRow,
  } from '$lib/engine/supersession';

  interface Props {
    overrides: LoadedOverride[];
    groups: MappingGroup[];
    review: ReviewItem[];
    suggestions: Suggestion[];
    swapped: boolean;
    blockIx: BlockedIndex;
    onEditOverride: (rule: LoadedOverride) => void;
    onDeleteOverride: (rule: LoadedOverride) => void;
    onEdit: (group: MappingGroup) => void;
    onDelete: (group: MappingGroup) => void;
    onDismissReview: (item: ReviewItem) => void;
    onAddReview: (item: ReviewItem) => void;
    onAddSuggestion: (s: Suggestion) => void;
    onDismissSuggestion: (s: Suggestion) => void;
  }

  let {
    overrides,
    groups,
    review,
    suggestions,
    swapped,
    blockIx,
    onEditOverride,
    onDeleteOverride,
    onEdit,
    onDelete,
    onDismissReview,
    onAddReview,
    onAddSuggestion,
    onDismissSuggestion,
  }: Props = $props();

  /** One entity in a cell. `source` is empty for a uid that never had one. */
  interface Cell {
    key: string;
    name: string;
    source: string;
    /** Blocked by content-blocklist.json, so this end of the mapping is dead. */
    dead: boolean;
  }

  interface Column {
    kind: 'new' | 'old';
    items: Cell[];
  }

  /** Replacements, parsed out of their packed `Name|Source` uid. */
  const targetCells = (refs: ReplacedByRef[]): Cell[] =>
    refs.map((ref) => {
      const dest = unpackUid(ref.uid);
      return {
        key: ref.uid,
        name: dest.name,
        source: dest.source,
        dead: isUidBlocked(blockIx, ref),
      };
    });

  const originalCells = (rows: SupersessionRow[]): Cell[] =>
    rows.map((row) => ({
      key: rowKey(row),
      name: row.displayName,
      source: row.source,
      dead: isEntityBlocked(blockIx, row.hash, row.prop, row.source),
    }));

  /** Names the marker mentioned, which have no prop and so no block check. */
  const uidCells = (uids: string[]): Cell[] =>
    uids.map((uid) => {
      const ref = unpackUid(uid);
      return { key: uid, name: ref.name, source: ref.source, dead: false };
    });

  const columns = (news: Cell[], olds: Cell[]): Column[] =>
    swapped
      ? [
          { kind: 'old', items: olds },
          { kind: 'new', items: news },
        ]
      : [
          { kind: 'new', items: news },
          { kind: 'old', items: olds },
        ];

  /**
   * How many original-to-replacement pairs Delete actually removes. Not
   * `originals.length`: in the default view a group carries each original's
   * whole target set, so a row with a split costs more than one mapping, and
   * in the swapped view each original loses exactly the one target.
   */
  const deleteCount = (group: MappingGroup): number =>
    swapped
      ? group.originals.length
      : group.originals.reduce((n, r) => n + r.replacedBy.length, 0);

  /** Every reason this group is dead, for the row's tooltip. */
  const groupBlockNote = (group: MappingGroup): string =>
    [...new Set(group.originals.map((r) => describeBlock(blockIx, r)))]
      .filter(Boolean)
      .join('\n');

  /**
   * Delete always confirms, group of one included: the button is beside rows
   * that look alike, and an undo would mean a history this page doesn't have.
   * Blur reverts, so an armed button left behind by a mis-click disarms itself.
   */
  let confirming = $state<string | null>(null);
</script>

<!-- One cell's worth of entities. All three row kinds draw a side the same
     way; only the badges and the actions differ. -->
{#snippet entities(items: Cell[])}
  {#each items as item (item.key)}
    <div class="entity">
      <span class="cell-name" class:struck={item.dead}>{item.name}</span>
      {#if item.source}
        <SourceTag
          source={item.source}
          class={item.dead ? 'struck' : undefined}
        />
      {/if}
    </div>
  {/each}
{/snippet}

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>{swapped ? 'Replaced item' : 'New item'}</th>
        <th>{swapped ? 'New item' : 'Replaced item'}</th>
        <th class="align-end">Actions</th>
      </tr>
    </thead>

    {#if overrides.length}
      <tbody>
        {#each overrides as rule (rule.id)}
          {@const armed = confirming === `override:${rule.id}`}
          {@const label = propLabel(rule.prop)}
          <tr class="override">
            <!-- Not the entities snippet: a rule's other side is a list of
                 sources, not entities, and one line per source made an
                 18-source rule eighteen rows tall. -->
            {#snippet ruleNew()}
              <div class="entity">
                <span class="cell-name">{label}</span>
                <SourceTag source={rule.from} />
                <Badge
                  title="A source override: its mappings are regenerated from the corpus on every Save"
                  >Override</Badge
                >
              </div>
              <span class="rule-count"
                >{formatNumber(rule.rowCount)}
                {rule.rowCount === 1 ? 'mapping' : 'mappings'}{rule.rowCount
                  ? ''
                  : ' once saved'}</span
              >
            {/snippet}
            {#snippet ruleOld()}
              <div class="rule-targets">
                <span class="cell-name"
                  >Same-named {label.toLowerCase()} in</span
                >
                {#each rule.targets as t (t)}<SourceTag source={t} />{/each}
              </div>
            {/snippet}
            {#if swapped}
              <td>{@render ruleOld()}</td>
              <td>{@render ruleNew()}</td>
            {:else}
              <td>{@render ruleNew()}</td>
              <td>{@render ruleOld()}</td>
            {/if}
            <td class="align-end">
              <div class="row-actions">
                <Button size="small" onclick={() => onEditOverride(rule)}
                  >Edit</Button
                >
                <Button
                  size="small"
                  variant={armed ? 'primary' : 'secondary'}
                  title={armed
                    ? 'Click again to remove'
                    : 'Removes the rule and every mapping it made'}
                  onclick={() => {
                    if (!armed) {
                      confirming = `override:${rule.id}`;
                      return;
                    }
                    confirming = null;
                    onDeleteOverride(rule);
                  }}
                  onblur={() => {
                    if (armed) confirming = null;
                  }}>{armed ? 'Confirm' : 'Delete'}</Button
                >
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    {/if}

    <tbody class:section={overrides.length}>
      {#each groups as group (group.key)}
        {@const why = groupBlockNote(group)}
        {@const armed = confirming === group.key}
        {@const n = deleteCount(group)}
        <tr class:blocklisted={why} title={why || undefined}>
          {#each columns(targetCells(group.replacements), originalCells(group.originals)) as col (col.kind)}
            <td>
              {@render entities(col.items)}
            </td>
          {/each}
          <td class="align-end">
            <div class="row-actions">
              <Button size="small" onclick={() => onEdit(group)}>Edit</Button>
              <Button
                size="small"
                variant={armed ? 'primary' : 'secondary'}
                title={armed
                  ? 'Click again to remove'
                  : n > 1
                    ? `Removes all ${n} mappings on this row`
                    : 'Removes this mapping'}
                onclick={() => {
                  if (!armed) {
                    confirming = group.key;
                    return;
                  }
                  confirming = null;
                  onDelete(group);
                }}
                onblur={() => {
                  if (armed) confirming = null;
                }}>{armed ? 'Confirm' : 'Delete'}</Button
              >
            </div>
          </td>
        </tr>
      {/each}
    </tbody>

    {#if review.length}
      <tbody class="section">
        {#each review as item (item.replacement)}
          <tr class="review">
            {#each columns(uidCells( [item.replacement] ), uidCells(item.targets)) as col (col.kind)}
              <td>
                {@render entities(col.items)}
                {#if col.kind === 'new'}
                  <Badge variant="warning">Review</Badge>
                {/if}
              </td>
            {/each}
            <td class="align-end">
              <div class="row-actions">
                <Button
                  size="small"
                  disabled={!item.targets.length}
                  title="Map it anyway, as a plain replacement"
                  onclick={() => onAddReview(item)}>Add replacement</Button
                >
                <Button size="small" onclick={() => onDismissReview(item)}
                  >Dismiss</Button
                >
              </div>
            </td>
          </tr>
          <!-- The note spans both entity columns: swapped, it would otherwise
               sit under an entity it is not about. -->
          <tr class="note-row">
            <td colspan="3" class="note">{item.reason}</td>
          </tr>
        {/each}
      </tbody>
    {/if}

    {#if suggestions.length}
      <tbody class="section">
        {#each suggestions as s (suggestionId(s))}
          {@const cols = columns(
            targetCells(s.missing),
            originalCells([s.row]),
          )}
          <tr class="suggested">
            {#each cols as col (col.kind)}
              <td>
                {@render entities(col.items)}
                {#if col.kind === 'new'}
                  <Badge>Suggested</Badge>
                {/if}
              </td>
            {/each}
            <td class="align-end">
              <div class="row-actions">
                <Button
                  size="small"
                  variant="primary"
                  title="Stage this mapping. Nothing is written until you Save."
                  onclick={() => onAddSuggestion(s)}>Add</Button
                >
                <Button
                  size="small"
                  title="Hide it for this session. Dismissals are never written to the file."
                  onclick={() => onDismissSuggestion(s)}>Dismiss</Button
                >
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    {/if}
  </table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: var(--text-sm);
  }
  th,
  td {
    text-align: start;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  th {
    color: var(--text-muted);
    font-weight: var(--font-weight-semibold);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-panel);
  }
  /* Each entity column takes an equal half; the actions column takes what it
     needs, so the two lists stay aligned as rows grow. */
  th:not(.align-end) {
    width: 45%;
  }
  .align-end {
    text-align: end;
  }
  .entity {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .row-actions {
    display: inline-flex;
    gap: 0.25rem;
    justify-content: flex-end;
  }

  /* --- blocked by content-blocklist.json -----------------------------------
     A struck name says "this end is dead"; the outline says "this whole row
     is". Both are drawn in --blocklisted (danger at half alpha) so they read
     as one signal, and the outline is offset INWARD - these rows sit flush
     against their neighbours, and an outline on the edge would merge with the
     next row's into a single box. */
  tr.blocklisted {
    outline: 1px solid var(--blocklisted);
    outline-offset: -1px;
  }
  .struck,
  .entity :global(.source-tag.struck) {
    text-decoration: line-through;
    text-decoration-color: var(--blocklisted);
  }

  /* A review note or a suggestion isn't in the file yet; the tint says so
     without a column of its own. */
  tr.review td,
  tr.note-row td {
    background: hsl(38 80% 56% / 0.05);
  }
  tr.suggested td {
    background: hsl(140 45% 50% / 0.05);
  }
  /* The note row underneath draws the separator, so the row it belongs to
     doesn't - the two read as one entry. */
  tr.review td {
    border-bottom: none;
  }
  .note {
    color: var(--text-muted);
    font-size: var(--text-xs);
    padding-top: 0;
  }
  tbody.section tr:first-child td {
    border-top: 1px solid var(--border);
  }
  .rule-targets {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.5rem;
  }
  .rule-count {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
