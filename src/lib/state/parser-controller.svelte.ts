/**
 * lib/state/parser-controller.svelte.ts — the Homebrew Parser's state and
 * actions: the CodeMirror view, the parse pipeline (collect arrays → validate
 * → nest), full schema validation, the content-link audit, editor ↔ outline
 * navigation, and load/save/deploy plus the prompt and merge actions.
 *
 * KEY MECHANICS
 * - Position cache: one bracket-scan over the raw text locates EVERY entity
 *   element (named or not, bookData included), keyed by type + entityIdx.
 *   Navigation, issue decorations and cursor-sync all key off it. Nodes are
 *   compared by key, never by reference ($state proxies make reference
 *   comparisons across raw/proxied nodes unreliable).
 * - Link issues: fetched from POST /api/validate after each parse, kept in a
 *   Map keyed `type:entityIdx` that is reassigned whole, never mutated.
 * - Full schema: the 5etools-utils schemas, checked as the homebrew CI checks
 *   them. Until they load, or if they can't, per-type property checks stand in.
 */
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Text } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  setDiagnostics,
  lintGutter,
  forEachDiagnostic,
  type Diagnostic,
} from '@codemirror/lint';
import {
  parseHomebrewFile,
  extractPropName,
  buildEntityPositions,
  documentKind,
  issueLocation,
  locatePointers,
  pointerLabel,
  BARE_SCHEMA,
  describeFixPrompt,
  describeMerge,
  buildNewSource,
  NEW_SOURCE_ID,
  mergeIntoBrew,
  parseModelReply,
  type ParsedNode,
  type ParsedHomebrew,
  type EntitySchema,
  type NodeLinkIssues,
  type EntityPosition,
  type DocumentKind,
  type SchemaIssue,
  type SchemaValidator,
} from '$lib/engine/audit';
import { renderEntry } from '$lib/engine/render';
import type { Entry } from '$lib/engine/types';
import { errorText, escapeHtml, formatFolderOutcome } from '$lib/util';
import { loadSchemaValidator } from '$lib/schema-validator-client';
import {
  schemaCompletionSource,
  wrapInTag,
} from '$lib/editor/schema-completion';
import {
  entityHighlight,
  issueLineDecorations,
  linkHover,
  linkMarkDecorations,
  makeLayer,
  parserTheme,
  tagHighlight,
  type MarkRange,
} from '$lib/editor/parser-cm';
import {
  deployHomebrew,
  getTypeSchema,
  readHomebrewFile,
  readHomebrewLibraryFile,
  readHomebrewText,
  saveHomebrewFile,
  toEntitySchema,
  validateFile,
} from '$lib/api';
import { copyConvertPrompt, copyFixPrompt } from '$lib/prompt-client';

/** A schema issue located in the editor text. */
export interface LocatedIssue {
  html: string;
  from: number;
  to: number;
}

export type SchemaStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'fallback'; reason: string };

/** Outcome of the last header action (save, deploy, prompt, merge). */
export interface ParserNote {
  ok: boolean;
  text: string;
  warnings?: string[];
}

export const keyOf = (n: ParsedNode): string => `${n.type}:${n.entityIdx}`;

// Display label for an entity: many types (bookData, itemGroup…) have no `name`.
export const entityLabel = (n: ParsedNode): string =>
  String(n.entity.name ?? n.entity.id ?? n.entity.source ?? '(unnamed)');

// The book page, shown beside the name as in the Renderer Demo's brew summary.
export const pageOf = (n: ParsedNode): string => {
  const p = n.entity.page;
  return typeof p === 'number' || (typeof p === 'string' && p) ? String(p) : '';
};

// `entries[0].type` + `Unknown type "lst".` → HTML with names in <code>.
const issueHtml = (path: string, message: string): string => {
  const msg = escapeHtml(message).replace(
    /&quot;(.*?)&quot;/g,
    '<code>$1</code>',
  );
  return path ? `<code>${escapeHtml(path)}</code>: ${msg}` : msg;
};

export class ParserController {
  // --- what's open ----------------------------------------------------------
  readonly fileParam: string;
  readonly repoParam: string;
  readonly repoFile: string;
  readonly fileName: string;
  /** Where the open file came from, for the header. */
  readonly fileOrigin: string;

  // --- parse results --------------------------------------------------------
  parsed = $state<ParsedHomebrew | null>(null);
  parseError = $state('');
  activeKey = $state('');
  /** The last successfully parsed document + its text (Resolved / Checks tabs). */
  docRecord = $state.raw<Record<string, unknown> | null>(null);
  docText = $state('');
  /** Link issues per node key — reassigned whole after each /api/validate response. */
  linkIssues = $state(new Map<string, NodeLinkIssues>());
  linkTotals = $state<{ brokenLinks: number; linkWarnings: number } | null>(
    null,
  );
  schemaStatus = $state<SchemaStatus>({ state: 'loading' });
  /** A brew file, or a bare entry (outlined as a preview, like the Renderer Demo). */
  docKind = $state<DocumentKind>('brew');
  entryHtml = $state('');
  /** Schema issues outside any entity: `_meta`, the top level, or a bare entry. */
  fileIssues = $state<LocatedIssue[]>([]);

  // --- file actions ---------------------------------------------------------
  canSave = $state(false);
  dirty = $state(false);
  saving = $state(false);
  deploying = $state(false);
  prompting = $state(false);
  note = $state<ParserNote | null>(null);
  // Add content → a prompt for a model; Merge reply → its JSON into the editor.
  // The pasted text is kept so a reopened dialog still has it.
  dialog = $state<'convert' | 'merge' | null>(null);
  convertText = $state('');
  replyText = $state('');

  // --- derived --------------------------------------------------------------
  isEntry = $derived(
    this.docKind === 'entry' && !this.parseError && this.docText !== '',
  );
  activeNode = $derived(
    this.parsed?.nodes.find((n) => keyOf(n) === this.activeKey) ?? null,
  );
  // Inclusive totals: schema issues + link issues, one Errors and one Warnings number.
  totalErrors = $derived(
    (this.parsed?.totals.errors ?? 0) +
      (this.linkTotals?.brokenLinks ?? 0) +
      this.fileIssues.length,
  );
  totalWarnings = $derived(
    (this.parsed?.totals.warnings ?? 0) + (this.linkTotals?.linkWarnings ?? 0),
  );
  cleanCount = $derived.by(() => {
    if (!this.parsed) return 0;
    return this.parsed.nodes.filter(
      (n) =>
        !n.errors.length &&
        !n.warnings.length &&
        !this.linkIssues.has(keyOf(n)),
    ).length;
  });

  // --- internals ------------------------------------------------------------
  #view: EditorView | null = null;
  #validator: SchemaValidator | null = null;
  #schemaCache = new Map<string, EntitySchema>();
  #positions: EntityPosition[] = [];
  #debounce: ReturnType<typeof setTimeout> | null = null;
  #linkGen = 0; // discards stale /api/validate responses
  /** Schema issues per node key, in the same order as that node's `errors`. */
  #nodeIssues = new Map<string, LocatedIssue[]>();
  /** The editor text as last loaded or saved; null when the file can't be saved. */
  #savedDoc: Text | null = null;
  #markRanges: MarkRange[] = [];
  #highlight = makeLayer(); // gold lines for the selected entity
  #issues = makeLayer(); // red/amber lines for validation problems
  #linkMarks = makeLayer(); // exact-span marks on broken content links

  /**
   * `file`: a homebrew-folder file name (?file=). `repo`: `<folder>/<file>` of
   * a homebrew-repo brew that isn't added yet (?repo=).
   */
  constructor(opts: { file: string; repo: string }) {
    this.fileParam = opts.file;
    this.repoParam = opts.repo;
    this.repoFile = opts.repo.slice(opts.repo.indexOf('/') + 1);
    this.fileName = this.fileParam || this.repoFile || 'Untitled.json';
    this.fileOrigin = this.fileParam
      ? 'homebrew folder'
      : this.repoFile
        ? 'homebrew repo'
        : '';
  }

  // --- editor lifecycle -----------------------------------------------------

  /** Create the editor in `parent` and open the requested file. Returns the teardown. */
  mount = (parent: HTMLElement): (() => void) => {
    const completions = schemaCompletionSource(() => ({
      validator: this.#validator,
      kind: this.docKind,
      defaultSource: this.#defaultSource(),
    }));
    this.#view = new EditorView({
      parent,
      state: EditorState.create({
        doc: '',
        extensions: [
          basicSetup,
          json(),
          oneDark,
          this.#highlight.field,
          this.#issues.field,
          tagHighlight,
          this.#linkMarks.field,
          linkHover(() => this.#markRanges),
          lintGutter(),
          EditorState.languageData.of(() => [{ autocomplete: completions }]),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                if (this.canSave) this.save();
                return this.canSave;
              },
            },
            { key: 'Alt-e', preventDefault: true, run: this.gotoNextIssue },
            { key: 'Alt-t', preventDefault: true, run: wrapInTag },
          ]),
          EditorView.lineWrapping,
          parserTheme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              this.dirty = !!this.#savedDoc && !u.state.doc.eq(this.#savedDoc);
              if (this.#debounce) clearTimeout(this.#debounce);
              this.#debounce = setTimeout(this.runParse, 300);
            } else if (u.selectionSet) this.#syncFromCursor();
          }),
        ],
      }),
    });

    // The schemas take a second or two to compile; re-check what's in the
    // editor once they're in.
    loadSchemaValidator().then((s) => {
      if (s.ok) {
        this.#validator = s.validator;
        this.schemaStatus = { state: 'ready' };
      } else this.schemaStatus = { state: 'fallback', reason: s.reason };
      if (this.#view?.state.doc.length) this.runParse();
    });

    this.#openRequested();

    return () => {
      this.#view?.destroy();
      this.#view = null;
    };
  };

  // Deep link: ?file=<name> loads that homebrew file into the editor,
  // ?repo=<folder>/<name> a brew from the homebrew repo. A working-folder file
  // loads as its raw text so Save keeps its formatting; if that can't be read
  // (a URL homebrew source), it loads read-only.
  #openRequested(): void {
    const { fileParam, repoParam, repoFile } = this;
    const slash = repoParam.indexOf('/');
    const pretty = (obj: unknown) => JSON.stringify(obj, null, 2);
    const load: Promise<{ text: string; saveable: boolean }> | null = fileParam
      ? readHomebrewText(fileParam).then(
          (text) => ({ text, saveable: true }),
          async () => ({
            text: pretty(await readHomebrewFile(fileParam)),
            saveable: false,
          }),
        )
      : slash > 0
        ? readHomebrewLibraryFile(repoParam.slice(0, slash), repoFile).then(
            (obj) => ({ text: pretty(obj), saveable: false }),
          )
        : null;
    if (!load) return;
    load
      .then(({ text, saveable }) => {
        const view = this.#view;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
        if (saveable) {
          this.#savedDoc = view.state.doc;
          this.dirty = false;
          this.canSave = true;
        }
        this.runParse();
      })
      .catch((e) => {
        this.note = {
          ok: false,
          text: `Couldn't open ${this.fileName}: ${(e as Error).message}`,
        };
      });
  }

  /** The brew's first source id, the default for `source` in new entities. */
  #defaultSource(): string | undefined {
    const meta = this.docRecord?._meta as
      { sources?: { json?: unknown }[] } | undefined;
    const id = meta?.sources?.[0]?.json;
    return typeof id === 'string' ? id : undefined;
  }

  // --- parse pipeline -------------------------------------------------------

  runParse = async (): Promise<void> => {
    const view = this.#view;
    this.#linkGen++; // discard any in-flight link-check for the previous document
    this.#markRanges = [];
    view?.dispatch({
      effects: [this.#issues.effect.of([]), this.#linkMarks.effect.of([])],
    }); // clear stale marks
    // Untrimmed: schema issue offsets index into the editor text as is.
    const text = view?.state.doc.toString() ?? '';
    const raw = text.trim();
    if (!raw) {
      this.parsed = null;
      this.parseError = '';
      this.docRecord = null;
      this.docText = '';
      this.#positions = [];
      this.linkIssues = new Map();
      this.linkTotals = null;
      this.entryHtml = '';
      this.docKind = 'brew';
      this.#clearSchemaIssues();
      return;
    }

    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      this.parsed = null;
      this.parseError = `Invalid JSON — ${(e as Error).message}`;
      this.#positions = [];
      this.#clearSchemaIssues();
      return;
    }
    this.parseError = '';

    // A bare entry (or array of entries): validate it and show a preview.
    this.docKind = documentKind(obj, this.#validator?.brewProps);
    if (this.docKind === 'entry') {
      this.parsed = null;
      this.docRecord = null;
      this.docText = raw;
      this.#positions = [];
      this.linkIssues = new Map();
      this.linkTotals = null;
      this.entryHtml = renderEntry(obj as Entry);
      if (this.#validator)
        this.#applySchemaIssues(
          text,
          this.#validator.validate(obj, 'entry'),
          null,
        );
      else this.#clearSchemaIssues();
      return;
    }
    this.entryHtml = '';

    // Pre-load schemas for the types present, then parse purely. With the
    // full schema loaded, its issues replace the property checks below.
    const record = obj as Record<string, unknown>;
    this.docRecord = record;
    this.docText = raw;
    const presentTypes = Object.keys(record).filter(
      (k) => Array.isArray(record[k]) && (record[k] as unknown[]).length,
    );
    if (!this.#validator) await this.#ensureSchemas(presentTypes);
    const result = parseHomebrewFile(record, (t) =>
      this.#validator ? BARE_SCHEMA : (this.#schemaCache.get(t) ?? BARE_SCHEMA),
    );
    if (this.#validator)
      this.#applySchemaIssues(
        text,
        this.#validator.validate(record, 'brew'),
        result,
      );
    else this.#clearSchemaIssues();

    this.parsed = result;
    this.linkIssues = new Map();
    this.linkTotals = null;
    this.#positions = buildEntityPositions(
      this.#view?.state.doc.toString() ?? '',
      result.nodes,
    );
    this.#view?.dispatch({ effects: this.#highlight.effect.of([]) });
    this.#applyIssueDecorations();
    this.#syncFromCursor();
    this.#runLinkCheck(record);
  };

  async #ensureSchemas(types: string[]): Promise<void> {
    await Promise.all(
      types.map(async (type) => {
        if (this.#schemaCache.has(type)) return;
        try {
          const typeSchema = await getTypeSchema(type);
          this.#schemaCache.set(
            type,
            typeSchema ? toEntitySchema(typeSchema) : BARE_SCHEMA,
          );
        } catch {
          this.#schemaCache.set(type, BARE_SCHEMA);
        }
      }),
    );
  }

  // --- full schema validation -----------------------------------------------

  /**
   * Locate schema issues in the text, hand per-entity ones to their nodes
   * (replacing the property checks) and the rest to fileIssues, and underline
   * them all in the editor.
   */
  #applySchemaIssues(
    raw: string,
    issues: SchemaIssue[],
    result: ParsedHomebrew | null,
  ): void {
    const spans = locatePointers(
      raw,
      issues.map((i) => i.pointer),
    );
    const byKey = new Map<string, ParsedNode>();
    for (const n of result?.nodes ?? []) byKey.set(keyOf(n), n);
    if (result)
      for (const n of result.nodes) {
        n.errors = [];
        n.warnings = [];
      }

    const nextNode = new Map<string, LocatedIssue[]>();
    const nextFile: LocatedIssue[] = [];
    const diags: Diagnostic[] = [];
    for (const issue of issues) {
      const span = spans.get(issue.pointer);
      let from = 0;
      let to = Math.min(1, raw.length);
      if (span) {
        // Underline a key or a scalar; for a whole object or array, just its
        // name (or opening bracket), not the whole block.
        const block = raw[span.from] === '{' || raw[span.from] === '[';
        if ((issue.atKey || block) && span.keyFrom != null) {
          from = span.keyFrom;
          to = span.keyTo!;
        } else if (block) {
          from = span.from;
          to = span.from + 1;
        } else {
          from = span.from;
          to = span.to;
        }
      }
      diags.push({
        from,
        to,
        severity: 'error',
        source: 'Schema',
        message: issue.message,
      });
      const where = result ? issueLocation(issue.pointer) : null;
      const node = where && byKey.get(`${where.type}:${where.entityIdx}`);
      if (node && where) {
        const html = issueHtml(where.path, issue.message);
        node.errors.push(html);
        const k = keyOf(node);
        (nextNode.get(k) ?? nextNode.set(k, []).get(k)!).push({
          html,
          from,
          to,
        });
      } else {
        nextFile.push({
          html: issueHtml(pointerLabel(issue.pointer), issue.message),
          from,
          to,
        });
      }
    }
    if (result) {
      let errors = 0;
      let clean = 0;
      for (const n of result.nodes) {
        errors += n.errors.length;
        if (!n.errors.length) clean++;
      }
      result.totals = { ...result.totals, errors, warnings: 0, clean };
    }
    this.#nodeIssues = nextNode;
    this.fileIssues = nextFile;
    const view = this.#view;
    if (view) view.dispatch(setDiagnostics(view.state, diags));
  }

  #clearSchemaIssues(): void {
    this.#nodeIssues = new Map();
    this.fileIssues = [];
    const view = this.#view;
    if (view) view.dispatch(setDiagnostics(view.state, []));
  }

  // --- content-link audit ---------------------------------------------------
  // POST /api/validate resolves everything server-side; we consume its link
  // half (schema validation already ran locally with the same schemas, so the
  // schema half would only duplicate what's on screen).

  async #runLinkCheck(doc: Record<string, unknown>): Promise<void> {
    const gen = ++this.#linkGen;
    try {
      const body = await validateFile(doc);
      if (gen !== this.#linkGen || !this.parsed) return;

      const next = new Map<string, NodeLinkIssues>();
      for (const n of body.issues) {
        if (!n.linkErrors.length && !n.linkWarnings.length) continue;
        next.set(`${n.type}:${n.entityIdx}`, {
          type: n.type,
          entityIdx: n.entityIdx,
          errors: n.linkErrors,
          warnings: n.linkWarnings,
        });
      }
      this.linkIssues = next; // single reassignment → badges/tabs/totals all react
      this.linkTotals = {
        brokenLinks: body.totals.brokenLinks ?? 0,
        linkWarnings: body.totals.linkWarnings ?? 0,
      };
      this.#applyIssueDecorations();
      this.#applyLinkMarkDecorations();
    } catch {
      /* link audit is best-effort — schema validation already rendered */
    }
  }

  #applyIssueDecorations(): void {
    const view = this.#view;
    if (!view) return;
    const ranges = issueLineDecorations(
      view.state.doc,
      this.#positions,
      (node) => {
        const li = this.linkIssues.get(keyOf(node));
        return {
          errors: node.errors.length + (li?.errors.length ?? 0),
          warnings: node.warnings.length + (li?.warnings.length ?? 0),
        };
      },
    );
    view.dispatch({ effects: this.#issues.effect.of(ranges) });
  }

  // Mark the exact broken ref spans and record them for the hover tooltip.
  #applyLinkMarkDecorations(): void {
    const view = this.#view;
    if (!view) return;
    const { ranges, marks } = linkMarkDecorations(
      view.state.doc.toString(),
      this.#positions,
      (node) => this.linkIssues.get(keyOf(node)),
    );
    this.#markRanges = marks;
    view.dispatch({ effects: this.#linkMarks.effect.of(ranges) });
  }

  // --- navigation (outline ↔ editor) ----------------------------------------

  /** Select an object (and optionally one of its properties) in the editor. */
  navigateTo = (node: ParsedNode, propName?: string | null): void => {
    const view = this.#view;
    if (!view) return;
    const k = keyOf(node);
    const cached = this.#positions.find((p) => keyOf(p.node) === k);
    if (!cached) return;
    const { pos: from, end } = cached;
    const raw = view.state.doc.toString();
    const doc = view.state.doc;

    let scrollPos = from;
    let propLine = -1;
    if (propName) {
      const idx = raw.indexOf(`"${propName}"`, from);
      if (idx !== -1 && idx <= end) {
        scrollPos = idx;
        propLine = doc.lineAt(idx).number;
      }
    }
    view.dispatch({
      effects: [
        this.#highlight.effect.of(entityHighlight(doc, from, end, propLine)),
        EditorView.scrollIntoView(scrollPos, { y: 'start', yMargin: 60 }),
      ],
    });
    this.activeKey = k;
  };

  /** Select a span in the editor and bring it into view. */
  jumpTo = (from: number, to: number): void => {
    const view = this.#view;
    if (!view) return;
    const end = Math.min(to, view.state.doc.length);
    view.dispatch({
      selection: { anchor: Math.min(from, end), head: end },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
  };

  /** An issue row's click: the exact spot for schema issues, else the property. */
  gotoIssue = (node: ParsedNode, i: number, msg: string): void => {
    const at = this.#nodeIssues.get(keyOf(node))?.[i];
    this.navigateTo(node, at ? null : extractPropName(msg));
    if (at) this.jumpTo(at.from, at.to);
  };

  /**
   * Move to the next error or warning after the cursor, wrapping at the end
   * (Alt+E, as in the 5etools Renderer Demo). Covers schema underlines, link
   * marks and, without the schema, the first line of each flagged object.
   */
  gotoNextIssue = (): boolean => {
    const view = this.#view;
    if (!view) return false;
    const points: number[] = [];
    forEachDiagnostic(view.state, (_d, from) => points.push(from));
    for (const r of this.#markRanges) points.push(r.from);
    if (!this.#validator)
      for (const { node, pos } of this.#positions)
        if (node.errors.length || node.warnings.length) points.push(pos);
    if (!points.length) return false;
    points.sort((a, b) => a - b);
    const head = view.state.selection.main.head;
    const next = points.find((p) => p > head) ?? points[0];
    this.jumpTo(next, next);
    return true;
  };

  #syncFromCursor(): void {
    const view = this.#view;
    if (!view || !this.#positions.length) return;
    const cursor = view.state.selection.main.head;
    let best: ParsedNode | null = null;
    for (const { node, pos } of this.#positions) {
      if (pos <= cursor) best = node;
      else break;
    }
    if (best) this.activeKey = keyOf(best);
  }

  // --- file actions -----------------------------------------------------------

  /** Copy a fix prompt for what's in the editor, unsaved changes included. */
  copyPrompt = async (): Promise<void> => {
    if (!this.docRecord) return;
    this.prompting = true;
    try {
      const p = await copyFixPrompt({
        file: this.fileName,
        doc: this.docRecord,
        raw: this.docText,
        inHomebrew: !!this.fileParam,
      });
      this.note = { ok: true, text: describeFixPrompt(p) };
    } catch (e) {
      this.note = {
        ok: false,
        text: `Couldn't copy a fix prompt: ${(e as Error).message}`,
      };
    } finally {
      this.prompting = false;
    }
  };

  copyConvert = async (text: string): Promise<void> => {
    await copyConvertPrompt({
      source: text,
      file: this.fileName,
      inHomebrew: !!this.fileParam,
      doc: this.docRecord,
    });
    this.note = {
      ok: true,
      text: 'Copied a convert prompt. Paste the reply into "Merge new content".',
    };
  };

  /** Replace the editor with an empty brew (a _meta and one source) to fill in. */
  newSource = async (): Promise<void> => {
    const view = this.#view;
    if (!view) return;
    const hasText = view.state.doc.toString().trim() !== '';
    if (
      hasText &&
      !confirm(
        'Replace what is in the editor with a new source? Ctrl+Z undoes it.',
      )
    )
      return;
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: buildNewSource(),
      },
    });
    view.focus();
    this.note = {
      ok: true,
      text: `Started a new source, ${NEW_SOURCE_ID}. Rename it in _meta, then use Add content and Merge reply.`,
    };
    if (this.#debounce) clearTimeout(this.#debounce);
    await this.runParse();
  };

  /** Merge a model's reply into the editor as one undoable change. */
  mergeReply = async (text: string): Promise<void> => {
    const view = this.#view;
    if (!view) return;
    const result = mergeIntoBrew(
      view.state.doc.toString(),
      parseModelReply(text),
    );
    view.dispatch({ changes: result.changes });
    this.replyText = '';
    this.note = {
      ok: true,
      text: describeMerge(result),
      warnings: result.warnings,
    };

    // Parse now rather than after the debounce, then show the first entry.
    if (this.#debounce) clearTimeout(this.#debounce);
    await this.runParse();
    const first = result.added[0] ?? result.replaced[0];
    if (!first) return;
    const node = this.parsed?.nodes.findLast(
      (n) => n.type === first.prop && entityLabel(n) === first.name,
    );
    if (node) this.navigateTo(node);
  };

  /** Write the editor text back to the open working-folder file. */
  save = async (): Promise<boolean> => {
    const view = this.#view;
    if (!view || !this.canSave || this.saving) return false;
    const doc = view.state.doc;
    this.saving = true;
    try {
      await saveHomebrewFile(this.fileParam, doc.toString());
      this.#savedDoc = doc;
      // Typing during the save leaves those edits unsaved.
      this.dirty = !!this.#view && !this.#view.state.doc.eq(doc);
      this.note = { ok: true, text: `Saved ${this.fileName}.` };
      return true;
    } catch (e) {
      this.note = { ok: false, text: (e as Error).message };
      return false;
    } finally {
      this.saving = false;
    }
  };

  /** Save if there are changes, then copy the file to Settings' deploy folders. */
  deploy = async (): Promise<void> => {
    if (!this.canSave || this.deploying) return;
    this.deploying = true;
    try {
      if (this.dirty && !(await this.save())) return;
      const { copied, errors: errs } = await deployHomebrew(this.fileParam);
      this.note = formatFolderOutcome(
        `Deployed ${this.fileName} to`,
        copied.length,
        errs,
        'Deploy failed',
      );
    } catch (e) {
      this.note = { ok: false, text: errorText(e) };
    } finally {
      this.deploying = false;
    }
  };
}
