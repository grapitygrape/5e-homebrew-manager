/**
 * state/supersessions.svelte.ts - the Replace Content document, shared
 * across routes.
 *
 * WHY A MODULE AND NOT COMPONENT STATE
 *   The table (`/replacement`) and the picker (`/replacement/pick`) are two
 *   routes over one unsaved document. Component state dies at the route
 *   change, and staging a group in the picker only to lose it on the way back
 *   is the one thing this split must not do. So the document lives here, in
 *   a `.svelte.ts` rune module, and both routes read the same object.
 *
 * NOTHING HERE TOUCHES DISK EXCEPT `saveDocument`
 *   Every table and picker action stages into `doc.rows` / `doc.review`;
 *   `dirty` compares against the snapshot taken at load or save, and the
 *   header's Save is the only writer. Deploy stays on the page because it
 *   copies the file on disk, not this.
 *
 * THE EXPORT SHAPE IS A RUNES CONSTRAINT, NOT A STYLE CHOICE
 *   A module-level `let x = $state()` cannot be reassigned from another module
 *   - the importer would hold the value, not the signal. So state is one
 *   internal `$state` object and the exports are accessor objects over it;
 *   assigning `doc.rows = next` from a route reaches the same proxy.
 */
import { SvelteSet } from 'svelte/reactivity';
import { rowKey } from '$lib/engine/supersession';
import { getSupersessions, saveSupersessions } from '$lib/api';
import type {
  LoadedOverride,
  ReviewItem,
  Duplicate,
  Suggestion,
  SupersessionRow,
} from '$lib/engine/supersession';

/** An entity as the picker holds it - the corpus row you clicked, verbatim. */
export interface PickedEntity {
  source: string;
  prop: string;
  name: string;
  hash: string;
  isHomebrew: boolean;
}

interface DocState {
  rows: SupersessionRow[];
  review: ReviewItem[];
  overrides: LoadedOverride[];
  envelope: Record<string, unknown>;
  fileExists: boolean;
  deployedExists: boolean;
  savedSnapshot: string;
  loaded: boolean;
  duplicatesMerged: number;
}

const state = $state<DocState>({
  rows: [],
  review: [],
  overrides: [],
  envelope: {},
  fileExists: false,
  deployedExists: false,
  savedSnapshot: '',
  loaded: false,
  duplicatesMerged: 0,
});

/**
 * Identity of the whole list, targets included - moving a mapping from one
 * replacement to another has to read as a change even though the row count
 * never moved.
 */
const snapshot = (
  list: SupersessionRow[],
  notes: ReviewItem[],
  rules: LoadedOverride[],
): string =>
  JSON.stringify([
    list
      .map((r) => `${rowKey(r)}=>${r.replacedBy.map((t) => t.uid).join(',')}`)
      .sort(),
    notes.map((r) => `${r.replacement}:${r.reason}`).sort(),
    // Unticking one spell inside a rule is an edit, so `exclude` counts.
    rules
      .map(
        (r) =>
          `${r.id}>${[...r.targets].sort().join(',')}-${[...r.exclude].sort().join(',')}`,
      )
      .sort(),
  ]);

const isDirty = $derived(
  state.savedSnapshot !== snapshot(state.rows, state.review, state.overrides),
);

/**
 * Declare what's in memory to be what's on disk. Only the two functions that
 * actually touch the file should call this - `dirty` is the gate on Save, and
 * clearing it without writing loses work silently.
 */
export function markSaved(): void {
  state.savedSnapshot = snapshot(state.rows, state.review, state.overrides);
}

/**
 * The baseline starts as the empty document, so a store nobody has read yet is
 * CLEAN.
 *
 * Left at '', an empty store compares unequal to its own snapshot and reports
 * itself dirty. That is not cosmetic: Save is gated on `dirty`, and
 * `loadDocument` throws before it mutates anything - so a read that failed on
 * a malformed file would leave Save armed to PUT zero rows over that same
 * file. The header's "unsaved changes" would also flash on every page load,
 * before the first fetch resolves.
 */
markSaved();

/** The parsed `content-replacement.json`, plus what Save/Deploy need to know. */
export const doc = {
  get rows(): SupersessionRow[] {
    return state.rows;
  },
  set rows(next: SupersessionRow[]) {
    state.rows = next;
  },
  get review(): ReviewItem[] {
    return state.review;
  },
  set review(next: ReviewItem[]) {
    state.review = next;
  },
  /** Source override rules. Their rows are made server-side on Save. */
  get overrides(): LoadedOverride[] {
    return state.overrides;
  },
  set overrides(next: LoadedOverride[]) {
    state.overrides = next;
  },
  /** Keys we didn't recognise on parse, written back verbatim on save. */
  get envelope(): Record<string, unknown> {
    return state.envelope;
  },
  set envelope(next: Record<string, unknown>) {
    state.envelope = next;
  },
  get fileExists(): boolean {
    return state.fileExists;
  },
  set fileExists(next: boolean) {
    state.fileExists = next;
  },
  get deployedExists(): boolean {
    return state.deployedExists;
  },
  set deployedExists(next: boolean) {
    state.deployedExists = next;
  },
  get savedSnapshot(): string {
    return state.savedSnapshot;
  },
  get loaded(): boolean {
    return state.loaded;
  },
  /** Rows the parser folded into an existing original; the page says so once. */
  get duplicatesMerged(): number {
    return state.duplicatesMerged;
  },
  get dirty(): boolean {
    return isDirty;
  },
};

/**
 * What the picker route is staging. `editingKeys` is the difference between
 * its two entry points: empty means "Add a replacement" (purely additive),
 * populated means Edit, and Save removes those rows before merging so that
 * trimming a chip actually drops the mapping.
 */
export const picker = $state<{
  newItems: PickedEntity[];
  replacedItems: PickedEntity[];
  editingKeys: string[];
}>({
  newItems: [],
  replacedItems: [],
  editingKeys: [],
});

export function resetPicker(): void {
  picker.newItems = [];
  picker.replacedItems = [];
  picker.editingKeys = [];
}

/**
 * Rescan results, minus what the document already says. `dismissed` is
 * session-scoped: nothing in the mapping file records a dismissal.
 */
export const suggestions = $state<{
  list: Suggestion[];
  /** `SvelteSet`, not `Set`: a plain Set here would type-check and silently
   *  stop the table updating when something is dismissed. */
  dismissed: SvelteSet<string>;
  /**
   * Homebrew sharing a name with official content, from the same Rescan.
   * Undiffed: the page subtracts what it has mapped as rows change. Null
   * until a scan has run, so the page can tell "none" from "not looked".
   */
  duplicates: Duplicate[] | null;
  /** `duplicateId`s set aside this session, as with `dismissed`. */
  dismissedDuplicates: SvelteSet<string>;
}>({
  list: [],
  dismissed: new SvelteSet<string>(),
  duplicates: null,
  dismissedDuplicates: new SvelteSet<string>(),
});

/**
 * Read `content-replacement.json` into the store. A second call is a no-op
 * unless forced, so the picker can deep-link on a cold load without stamping
 * on unsaved edits when it was reached from the table. Throws; the caller owns
 * the banner.
 */
export async function loadDocument(force = false): Promise<void> {
  if (state.loaded && !force) return;
  const body = await getSupersessions();
  state.rows = body.rows;
  state.review = body.review;
  state.overrides = body.overrides ?? [];
  state.envelope = body.envelope;
  state.fileExists = body.fileExists;
  state.deployedExists = body.deployedExists;
  state.duplicatesMerged = body.duplicatesMerged ?? 0;
  markSaved();
  state.loaded = true;
}

/** The only thing in this module that writes. Throws; the caller owns the banner. */
export async function saveDocument(): Promise<{
  count: number;
  warnings: string[];
}> {
  const body = await saveSupersessions({
    rows: state.rows,
    review: state.review,
    envelope: state.envelope,
    overrides: state.overrides.map(({ id, prop, from, targets, exclude }) => ({
      id,
      prop,
      from,
      targets,
      exclude,
    })),
  });
  markSaved();
  state.fileExists = true;
  return { count: body.count, warnings: body.warnings ?? [] };
}
