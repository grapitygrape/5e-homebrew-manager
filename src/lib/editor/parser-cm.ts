/**
 * lib/editor/parser-cm.ts — the Parser's CodeMirror pieces: decoration layers,
 * inline `{@tag}` highlighting, the broken-link hover, the editor theme, and
 * the functions that turn parse results into decoration ranges.
 *
 * The decoration classes (`cm-hb-*`, `hb-link-tip`) are styled globally in
 * routes/parser/+page.svelte.
 */
import {
  EditorView,
  Decoration,
  hoverTooltip,
  type DecorationSet,
} from '@codemirror/view';
import {
  EditorState,
  StateField,
  StateEffect,
  type Extension,
  type Range,
  type StateEffectType,
  type Text,
} from '@codemirror/state';
import type {
  EntityPosition,
  NodeLinkIssues,
  ParsedNode,
} from '$lib/engine/audit';

// --- decoration layers ------------------------------------------------------

type DecoRanges = readonly Range<Decoration>[];

export interface DecorationLayer {
  /** Dispatch `effect.of(ranges)` to replace the layer's decorations. */
  effect: StateEffectType<DecoRanges>;
  field: StateField<DecorationSet>;
}

/** A decoration set that maps through edits and is replaced whole by its effect. */
export function makeLayer(): DecorationLayer {
  const effect = StateEffect.define<DecoRanges>();
  const field = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      deco = deco.map(tr.changes);
      for (const e of tr.effects)
        if (e.is(effect)) return Decoration.set(e.value, true);
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return { effect, field };
}

// --- inline {@tag} highlighting ---------------------------------------------

// Recomputed from the document on every change.
const TAG_RE = /\{@(\w+)([^}]*)\}/g;
const TAG_MAX = 600000;
function computeTagDecos(state: EditorState): DecorationSet {
  const text = state.doc.toString();
  if (!text || text.length > TAG_MAX) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(text))) {
    const start = m.index;
    const end = start + m[0].length;
    ranges.push(Decoration.mark({ class: 'cm-hb-ref' }).range(start, end));
    ranges.push(
      Decoration.mark({ class: 'cm-hb-ref-tag' }).range(
        start + 1,
        start + 2 + m[1].length,
      ),
    );
    const pipe = m[0].lastIndexOf('|');
    if (pipe > 0 && start + pipe < end - 1)
      ranges.push(
        Decoration.mark({ class: 'cm-hb-ref-source' }).range(
          start + pipe,
          end - 1,
        ),
      );
  }
  return Decoration.set(ranges, true);
}
export const tagHighlight = StateField.define<DecorationSet>({
  create: (state) => computeTagDecos(state),
  update: (deco, tr) => (tr.docChanged ? computeTagDecos(tr.state) : deco),
  provide: (f) => EditorView.decorations.from(f),
});

// --- broken-link hover ------------------------------------------------------

/** One marked broken-link span, for the hover tooltip. */
export interface MarkRange {
  from: number;
  to: number;
  severity: 'error' | 'warning';
  text: string;
}

/**
 * Hover tooltip explaining broken-link highlights (severity + plain reason).
 * Title attributes on merged spans proved unreliable, hence a tooltip.
 */
export function linkHover(marks: () => MarkRange[]): Extension {
  return hoverTooltip((_view, pos) => {
    const hit = marks().find((r) => pos >= r.from && pos <= r.to);
    if (!hit) return null;
    return {
      pos: hit.from,
      end: hit.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.className = `hb-link-tip ${hit.severity}`;
        dom.textContent = `${hit.severity === 'error' ? 'Error' : 'Warning'}: ${hit.text}`;
        return { dom };
      },
    };
  });
}

// --- theme ------------------------------------------------------------------

export const parserTheme = EditorView.theme({
  '&': { height: '100%' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    overflow: 'auto',
  },
  '&.cm-editor': { backgroundColor: 'var(--bg-sidebar)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-sidebar)',
    borderRight: '1px solid var(--border)',
  },
});

// --- decoration ranges from parse results -------------------------------------

/** Red/amber line on the first line of each object with problems. */
export function issueLineDecorations(
  doc: Text,
  positions: EntityPosition[],
  counts: (node: ParsedNode) => { errors: number; warnings: number },
): Range<Decoration>[] {
  const seen = new Set<number>();
  const ranges: Range<Decoration>[] = [];
  for (const { node, pos } of positions) {
    const { errors, warnings } = counts(node);
    if (!errors && !warnings) continue;
    const lineFrom = doc.lineAt(Math.min(pos, doc.length)).from;
    if (seen.has(lineFrom)) continue;
    seen.add(lineFrom);
    const cls = errors ? 'cm-hb-error-line' : 'cm-hb-warning-line';
    ranges.push(Decoration.line({ class: cls }).range(lineFrom));
  }
  return ranges.sort((a, b) => a.from - b.from);
}

/**
 * The exact broken-ref spans inside each offending object's range, plus the
 * same spans as MarkRanges for the hover tooltip.
 */
export function linkMarkDecorations(
  raw: string,
  positions: EntityPosition[],
  linkIssuesFor: (node: ParsedNode) => NodeLinkIssues | undefined,
): { ranges: Range<Decoration>[]; marks: MarkRange[] } {
  const ranges: Range<Decoration>[] = [];
  const marks: MarkRange[] = [];
  for (const { node, pos, end } of positions) {
    const issue = linkIssuesFor(node);
    if (!issue) continue;
    for (const li of [...issue.errors, ...issue.warnings]) {
      if (!li.raw || li.raw.length < 2) continue;
      const isError = issue.errors.includes(li);
      const cls = isError ? 'cm-hb-link-broken' : 'cm-hb-link-warn';
      let from = raw.indexOf(li.raw, pos);
      while (from !== -1 && from <= end) {
        ranges.push(
          Decoration.mark({ class: cls }).range(from, from + li.raw.length),
        );
        marks.push({
          from,
          to: from + li.raw.length,
          severity: isError ? 'error' : 'warning',
          text: li.plain,
        });
        from = raw.indexOf(li.raw, from + li.raw.length);
      }
    }
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  // Errors win when spans overlap (find() hits the earlier-sorted error first).
  marks.sort((a, b) => a.from - b.from || (a.severity === 'error' ? -1 : 1));
  return { ranges, marks };
}

/** Gold lines over one object, stronger on `propLine` (-1 for none). */
export function entityHighlight(
  doc: Text,
  from: number,
  end: number,
  propLine: number,
): Range<Decoration>[] {
  const decos: Range<Decoration>[] = [];
  for (
    let ln = doc.lineAt(from).number;
    ln <= doc.lineAt(Math.min(end, doc.length - 1)).number;
    ln++
  ) {
    const line = doc.line(ln);
    decos.push(
      Decoration.line({
        class:
          ln === propLine
            ? 'cm-hb-highlighted cm-hb-highlighted-strong'
            : 'cm-hb-highlighted',
      }).range(line.from),
    );
  }
  return decos;
}
