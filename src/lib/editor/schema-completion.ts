/**
 * lib/editor/schema-completion.ts — CodeMirror autocomplete from the brew
 * schema: property names, allowed values, snippets for new entries and
 * entities, and `{@tag}` names inside strings. Plus a command that wraps the
 * selection in a tag.
 *
 * The schema half is engine/audit/schema-complete.ts; this only maps the
 * cursor (json-context.ts) to it and the results to CodeMirror options.
 */
import {
  snippetCompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import {
  propertyOptions,
  resolvePath,
  snippetOptions,
  valueOptions,
  type SchemaValidator,
  type DocumentKind,
} from '$lib/engine/audit';
import { LINK_TAGS, NON_LINK_TAGS } from '$lib/engine/tag-registry';
import { cursorContext } from './json-context.ts';

export interface CompletionEnv {
  validator: SchemaValidator | null;
  kind: DocumentKind;
  /** The brew's first source id, for `source` in new entities. */
  defaultSource?: string;
}

const TAGS: Completion[] = [
  ...Object.keys(LINK_TAGS).map((t) => ({
    label: t,
    type: 'keyword',
    detail: 'link',
  })),
  ...[...NON_LINK_TAGS].map((t) => ({ label: t, type: 'keyword' })),
].sort((a, b) => a.label.localeCompare(b.label));

export function schemaCompletionSource(
  env: () => CompletionEnv,
): CompletionSource {
  return (cx: CompletionContext): CompletionResult | null => {
    const ctx = cursorContext(cx.state, cx.pos);
    if (!ctx) return null;

    if (ctx.kind === 'tag') {
      // `{@spell Fireball}`: the name, then a space unless one follows.
      const after = cx.state.sliceDoc(cx.pos, cx.pos + 1);
      return {
        from: ctx.from,
        to: ctx.to,
        options: TAGS.map((t) => ({
          ...t,
          apply: after === ' ' ? t.label : `${t.label} `,
        })),
        validFor: /^\w*$/,
      };
    }

    const { validator, kind, defaultSource } = env();
    if (!validator) return null;
    const root = validator.rootFor(
      kind,
      cx.state.sliceDoc(0, 200).trimStart().startsWith('['),
    );
    const locs = resolvePath(
      validator.index,
      root,
      ctx.path,
      (k) => ctx.types[k],
    );
    if (!locs.length) return null;

    if (ctx.kind === 'property') {
      const typeHint = ctx.types[ctx.path.length];
      const props = propertyOptions(
        validator.index,
        locs,
        typeHint,
        ctx.present,
      );
      if (!props.length) return null;
      return {
        from: ctx.from,
        to: ctx.to,
        options: props.map((p, i) => {
          const base: Completion = {
            label: p.name,
            type: 'property',
            detail: p.required ? 'required' : undefined,
            info: p.description || undefined,
            // Keep the engine's order (required, then name/type/source/page).
            boost: 99 - Math.min(i, 198),
          };
          if (ctx.hasColon) return { ...base, apply: JSON.stringify(p.name) };
          const filled = filledValue(
            validator,
            root,
            [...ctx.path, p.name],
            kind,
            defaultSource,
          );
          return filled
            ? snippetCompletion(
                `${JSON.stringify(p.name)}: ${filled.template}`,
                {
                  ...base,
                  detail: [base.detail, filled.detail]
                    .filter(Boolean)
                    .join(', '),
                },
              )
            : { ...base, apply: `${JSON.stringify(p.name)}: ` };
        }),
        validFor: /^"?[\w$-]*"?$/,
      };
    }

    // A value: literals, then snippets for a new object here.
    const options: Completion[] = valueOptions(validator.index, locs).map(
      (v) => ({
        label: v.insert,
        displayLabel: v.label,
        type: 'constant',
      }),
    );
    const typed = cx.state.sliceDoc(ctx.from, ctx.to);
    if (!typed.startsWith('"')) {
      const top =
        kind === 'brew' && ctx.path.length === 2
          ? String(ctx.path[0])
          : undefined;
      for (const s of snippetOptions(validator.index, locs, {
        defaultSource,
        noun: top,
      }))
        options.push(
          snippetCompletion(s.template, {
            label: s.label,
            detail: s.detail,
            type: 'class',
          }),
        );
    }
    if (!options.length) return null;
    return { from: ctx.from, to: ctx.to, options };
  };
}

/**
 * A ready-made value for a property being added: a top-level brew array gets
 * one entity template inside it (`"vehicle": [ {…} ]`), and a property that
 * takes one kind of object gets that object's required properties. Null when
 * there's nothing better than `"key": `.
 */
function filledValue(
  validator: SchemaValidator,
  root: ReturnType<SchemaValidator['rootFor']>,
  path: (string | number)[],
  kind: DocumentKind,
  defaultSource?: string,
): { template: string; detail: string } | null {
  const idx = validator.index;
  if (kind === 'brew' && path.length === 1) {
    const forms = snippetOptions(idx, resolvePath(idx, root, [...path, 0]), {
      defaultSource,
      noun: String(path[0]),
    });
    const form = forms.find((f) => !f.label.endsWith('_copy'));
    if (form)
      return {
        template: `[\n\t${form.template.replace(/\n/g, '\n\t')}\n]`,
        detail: 'array with a template',
      };
  }
  const forms = snippetOptions(idx, resolvePath(idx, root, path), {
    defaultSource,
  });
  if (forms.length === 1 && forms[0].detail === 'template')
    return { template: forms[0].template, detail: 'with required properties' };
  return null;
}

/**
 * Wrap the selection in `{@ … }` and open the tag list, so choosing `spell`
 * gives `{@spell Fireball}`. With nothing selected it inserts `{@}`.
 */
export function wrapInTag(view: EditorView): boolean {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  const insert = text ? `{@ ${text}}` : '{@}';
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + 2 },
    userEvent: 'input',
  });
  startCompletion(view);
  return true;
}
