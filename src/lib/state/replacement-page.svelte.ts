/**
 * lib/state/replacement-page.svelte.ts — state, filtering, rescan, and actions
 * for the Replace Content view (`/replacement`).
 */
import { goto } from '$app/navigation';
import type { BannerState } from '$lib/ui/Banner.svelte';
import {
  buildBlockedIndex,
  isRowBlocked,
  EMPTY_BLOCKED_INDEX,
} from '$lib/components/replacement/blocked.ts';
import { loadBlockEntries } from '$lib/components/replacement/load-block-entries.ts';
import type { BlocklistEntry } from '$lib/engine/blocklist';
import { propLabel } from '$lib/engine/blocklist';
import {
  buildManualRow,
  diffSuggestions,
  duplicateId,
  duplicateRows,
  groupByReplacement,
  groupByReplacementSet,
  groupRowKeys,
  hashForEntity,
  mergeRows,
  removeGroup,
  rowKey,
  suggestionPairKey,
  unmappedDuplicates,
  unpackUid,
} from '$lib/engine/supersession';
import type {
  Duplicate,
  LoadedOverride,
  MappingGroup,
  ReplacedByRef,
  ReviewItem,
  Suggestion,
  SupersessionRow,
} from '$lib/engine/supersession';
import type { PickedEntity } from '$lib/state/supersessions.svelte.ts';
import {
  doc,
  loadDocument,
  picker,
  resetPicker,
  saveDocument,
  suggestions,
} from '$lib/state/supersessions.svelte.ts';
import { resyncRules } from '$lib/state/foundry.svelte.ts';
import { formatNumber, plural } from '$lib/util';
import { deploySupersessions, scanReplacementMarkers } from '$lib/api';

/** Shares the type select; the `!` keeps it from colliding with a prop. */
export const WARNINGS_FILTER = '!warnings';

export const rowMatches = (row: SupersessionRow, q: string): boolean =>
  row.displayName.toLowerCase().includes(q) ||
  row.source.toLowerCase().includes(q) ||
  row.replacedBy.some((t) => t.uid.toLowerCase().includes(q));

const pickedTarget = (ref: ReplacedByRef): PickedEntity => {
  const dest = unpackUid(ref.uid);
  return {
    source: dest.source,
    prop: ref.prop,
    name: dest.name,
    hash: hashForEntity({
      name: dest.name,
      source: dest.source,
      prop: ref.prop,
    }),
    isHomebrew: true,
  };
};

/**
 * Review notes carry no prop tag, so prefer another mapping pointing at the
 * same replacement; failing that, spells carry almost all "Replaces:" markers.
 */
export function guessProp(rows: SupersessionRow[], uid: string): string {
  for (const row of rows) {
    for (const ref of row.replacedBy) if (ref.uid === uid) return ref.prop;
  }
  return 'spell';
}

export class ReplacementPage {
  loading = $state(true);
  busy = $state(false);
  deploying = $state(false);
  scanning = $state(false);
  scanningFoundry = $state(false);
  viewingDuplicates = $state(false);

  banner = $state<BannerState | null>(null);
  blockEntries = $state<BlocklistEntry[]>([]);

  listQuery = $state('');
  category = $state('');
  swapped = $state(false);

  readonly blockIx = $derived(
    this.blockEntries.length
      ? buildBlockedIndex(this.blockEntries)
      : EMPTY_BLOCKED_INDEX,
  );

  readonly query = $derived(this.listQuery.trim().toLowerCase());
  readonly warningsOnly = $derived(this.category === WARNINGS_FILTER);
  readonly typeFilter = $derived(this.warningsOnly ? '' : this.category);

  /** Filter first, then group: a group is a view of whatever survived. */
  readonly filteredRows = $derived(
    doc.rows.filter(
      (row) =>
        (!this.warningsOnly || isRowBlocked(this.blockIx, row)) &&
        (!this.typeFilter || row.prop === this.typeFilter) &&
        (!this.query || rowMatches(row, this.query)),
    ),
  );

  /** Rules match on their own source and their targets - they have no names. */
  readonly visibleOverrides = $derived(
    doc.overrides.filter(
      (rule) =>
        !this.warningsOnly &&
        (!this.typeFilter || rule.prop === this.typeFilter) &&
        (!this.query ||
          rule.from.toLowerCase().includes(this.query) ||
          rule.targets.some((t) => t.toLowerCase().includes(this.query))),
    ),
  );

  readonly groups = $derived(
    this.swapped
      ? groupByReplacement(this.filteredRows)
      : groupByReplacementSet(this.filteredRows),
  );

  /**
   * Review notes carry no prop, so they stand aside while a type filter is
   * active. They are warnings, so the Warnings filter keeps them.
   */
  readonly visibleReview = $derived(
    this.typeFilter
      ? []
      : doc.review.filter(
          (item) =>
            !this.query ||
            item.replacement.toLowerCase().includes(this.query) ||
            item.targets.some((t) => t.toLowerCase().includes(this.query)),
        ),
  );

  readonly visibleSuggestions = $derived(
    suggestions.list
      .map((s) => ({
        ...s,
        // Dismissals are per target pair so the other half of a split stays suggested.
        missing: s.missing.filter(
          (t) => !suggestions.dismissed.has(suggestionPairKey(s.row, t)),
        ),
      }))
      .filter(
        (s) =>
          s.missing.length &&
          !this.warningsOnly &&
          (!this.typeFilter || s.row.prop === this.typeFilter) &&
          (!this.query || rowMatches(s.row, this.query)),
      ),
  );

  readonly pendingDuplicates = $derived.by(() => {
    if (!suggestions.duplicates) return [];
    const handled = new Set(doc.rows.map(rowKey));
    for (const rule of doc.overrides) for (const k of rule.keys) handled.add(k);
    for (const s of suggestions.list) handled.add(rowKey(s.row));
    return unmappedDuplicates(suggestions.duplicates, handled).filter(
      (d) => !suggestions.dismissedDuplicates.has(duplicateId(d)),
    );
  });

  readonly categories = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const row of doc.rows)
      counts.set(row.prop, (counts.get(row.prop) ?? 0) + 1);
    for (const rule of doc.overrides)
      counts.set(rule.prop, (counts.get(rule.prop) ?? 0) + rule.rowCount);
    return [...counts]
      .map(([prop, count]) => ({ prop, count, label: propLabel(prop) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly overrideRowCount = $derived(
    doc.overrides.reduce((n, r) => n + r.rowCount, 0),
  );

  readonly deadRows = $derived(
    doc.rows.filter((row) => isRowBlocked(this.blockIx, row)).length,
  );

  readonly warningCount = $derived(this.deadRows + doc.review.length);

  private fail = (text: string) => {
    this.banner = { tone: 'error', text };
  };

  /**
   * `force` on explicit reload only: coming back from `/replacement/pick`
   * must preserve staged edits in the shared store.
   */
  load = async (force: boolean): Promise<void> => {
    this.loading = true;
    // `duplicatesMerged` persists in the store, so only an actual read reports it.
    const read = force || !doc.loaded;
    try {
      await loadDocument(force);
      if (read && doc.duplicatesMerged) {
        this.banner = {
          tone: 'warn',
          text: `${doc.duplicatesMerged} ${plural(doc.duplicatesMerged, 'row', 'rows')} named an original another row already claimed - folded into ${plural(doc.duplicatesMerged, 'a split', 'splits')}. Check the table, then Save to write it back.`,
        };
      }
    } catch (e) {
      this.fail(`Could not read the mapping file: ${(e as Error).message}`);
    } finally {
      this.loading = false;
    }
  };

  mount = (): void => {
    void this.load(false);
    void loadBlockEntries((e) => (this.blockEntries = e));
  };

  rescan = async (): Promise<void> => {
    this.scanning = true;
    this.banner = null;
    try {
      const body = await scanReplacementMarkers();
      suggestions.list = diffSuggestions(body.candidates, doc.rows);
      suggestions.duplicates = body.duplicates;
      const found = suggestions.list.length;
      const hidden = found - this.visibleSuggestions.length;
      const dupes = this.pendingDuplicates.length
        ? ` ${formatNumber(this.pendingDuplicates.length)} unmapped ${plural(this.pendingDuplicates.length, 'duplicate', 'duplicates')} of official content - see Duplicates.`
        : '';
      const notes = body.review.length
        ? ` ${formatNumber(body.review.length)} ${plural(body.review.length, 'marker', 'markers')} the scan could not resolve are not listed - re-read them from the brew itself.`
        : '';
      this.banner = {
        tone: 'ok',
        text:
          `Scanned ${formatNumber(body.scanned)} ${plural(body.scanned, 'marker', 'markers')} across ${formatNumber(body.fileCount)} ${plural(body.fileCount, 'file', 'files')}: ${formatNumber(body.candidates.length)} ${plural(body.candidates.length, 'candidate', 'candidates')}, ${found ? `${formatNumber(found)} not mapped yet` : 'nothing missing'}` +
          `${hidden ? ` (${formatNumber(hidden)} hidden by the filters)` : ''}.${dupes}${notes}`,
      };
    } catch (e) {
      this.fail(`Rescan failed: ${(e as Error).message}`);
    } finally {
      this.scanning = false;
    }
  };

  addSuggestion = (s: Suggestion): void => {
    doc.rows = mergeRows(doc.rows, [{ ...s.row, replacedBy: s.missing }]).rows;
    suggestions.list = diffSuggestions(
      suggestions.list.map((other) => other.row),
      doc.rows,
    );
  };

  dismissSuggestion = (s: Suggestion): void => {
    for (const target of s.missing)
      suggestions.dismissed.add(suggestionPairKey(s.row, target));
  };

  addDuplicate = (d: Duplicate): void => {
    doc.rows = mergeRows(doc.rows, duplicateRows(d)).rows;
  };

  dismissDuplicate = (d: Duplicate): void => {
    suggestions.dismissedDuplicates.add(duplicateId(d));
  };

  addAllSuggestions = (): void => {
    for (const s of this.visibleSuggestions) this.addSuggestion(s);
  };

  editOverride = (rule: LoadedOverride): void => {
    void goto(
      `/replacement/override?source=${encodeURIComponent(rule.from)}&prop=${encodeURIComponent(rule.prop)}`,
    );
  };

  deleteOverride = (rule: LoadedOverride): void => {
    doc.overrides = doc.overrides.filter((r) => r.id !== rule.id);
    this.banner = {
      tone: 'ok',
      text: `Removed the ${rule.from} override. Its mappings go on Save.`,
    };
  };

  /**
   * Default view groups by target set (delete whole rows); swapped view groups
   * by one replacement (strip only that target so split rows keep their other targets).
   */
  deleteGroup = (group: MappingGroup): void => {
    doc.rows = removeGroup(
      doc.rows,
      groupRowKeys(group),
      this.swapped ? group.replacements[0].uid : undefined,
    );
  };

  /**
   * Hands the picker both halves plus `editingKeys` so trimming a chip removes
   * it. In swapped view, include every target referenced by those originals so
   * a round trip doesn't silently drop other targets on split rows.
   */
  editGroup = (group: MappingGroup): void => {
    const targets = this.swapped
      ? [
          ...new Map(
            group.originals.flatMap((row) =>
              row.replacedBy.map((ref) => [ref.uid, ref] as const),
            ),
          ).values(),
        ]
      : group.replacements;
    picker.newItems = targets.map(pickedTarget);
    picker.replacedItems = group.originals.map((row) => ({
      source: row.source,
      prop: row.prop,
      name: row.displayName,
      hash: row.hash,
      isHomebrew: false,
    }));
    picker.editingKeys = groupRowKeys(group);
    void goto('/replacement/pick');
  };

  addReplacement = (): void => {
    resetPicker();
    void goto('/replacement/pick');
  };

  dismissReview = (item: ReviewItem): void => {
    doc.review = doc.review.filter((r) => r.replacement !== item.replacement);
  };

  acceptReview = (item: ReviewItem): void => {
    const replacement = unpackUid(item.replacement);
    const targets = item.targets.map(unpackUid);
    if (
      !replacement.source ||
      targets.some((t) => !t.source || t.source === '?')
    ) {
      this.fail(
        'That note names a target without a source, so there is no hash to map. Use Add a replacement instead.',
      );
      return;
    }
    try {
      const prop = guessProp(doc.rows, item.replacement);
      const built = targets.map((t) =>
        buildManualRow(
          { name: t.name, source: t.source, prop },
          { name: replacement.name, source: replacement.source, prop },
        ),
      );
      const merged = mergeRows(doc.rows, built);
      doc.rows = merged.rows;
      this.dismissReview(item);
      this.banner = {
        tone: 'ok',
        text: `Accepted ${item.replacement} as a plain replacement (${merged.added + merged.merged} ${plural(merged.added + merged.merged, 'mapping', 'mappings')}). Nothing is written until you Save.`,
      };
    } catch (e) {
      this.fail((e as Error).message);
    }
  };

  save = async (): Promise<void> => {
    this.busy = true;
    this.banner = null;
    try {
      const { count, warnings } = await saveDocument();
      // Rule rows are expanded server-side, so re-read to refresh their counts.
      if (doc.overrides.length) await loadDocument(true);
      void resyncRules();
      const saved = `Saved ${formatNumber(count)} ${plural(count, 'mapping', 'mappings')} to the tools repo.`;
      this.banner = warnings.length
        ? { tone: 'warn', text: `${saved} ${warnings.join(' ')}` }
        : {
            tone: 'ok',
            text: `${saved} Deploy to copy it where the site reads it.`,
          };
    } catch (e) {
      this.fail((e as Error).message);
    } finally {
      this.busy = false;
    }
  };

  deploy = async (): Promise<void> => {
    const wasDirty = doc.dirty;
    this.deploying = true;
    this.banner = null;
    try {
      const { to } = await deploySupersessions();
      doc.deployedExists = true;
      this.banner = wasDirty
        ? {
            tone: 'warn',
            text: `Copied the saved file to ${to} - your unsaved changes were not included. Save, then Deploy again.`,
          }
        : { tone: 'ok', text: `Copied to ${to}.` };
    } catch (e) {
      this.fail((e as Error).message);
    } finally {
      this.deploying = false;
    }
  };

  cancel = async (): Promise<void> => {
    this.banner = null;
    await this.load(true);
    suggestions.list = diffSuggestions(
      suggestions.list.map((s) => s.row),
      doc.rows,
    );
  };
}
