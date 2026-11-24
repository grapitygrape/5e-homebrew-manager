/**
 * engine/merge/copy-applier.ts — a faithful, traced port of 5etools'
 * `DataUtil.generic.copyApplier` (+ `_versions` / `_templates` expansion).
 *
 * INTENT
 *   `_copy`/`_mod`/`_templates`/`_versions` are the least intuitive part of
 *   the brew format, and 5etools applies them silently. This module applies
 *   them the SAME way the site does (js/utils.js `getCopy`, `getVersions`) but
 *   records every step — which parent props were inherited, which were dropped
 *   for lack of `_preserve`, what each `_mod` did, which failed and why — so
 *   the resolved-entity preview can explain the result instead of just
 *   showing it. copy.ts `resolveCopy` delegates here, so the merge pipeline
 *   and the preview can't disagree.
 *
 * FIDELITY NOTES (vs 5etools)
 *   - Mods that 5etools throws on (missing array, name not found) are recorded
 *     as trace ERRORS and skipped; we never throw on user data.
 *   - `calculateProp` / variable math go through safeArithmetic, never eval.
 *   - `replaceTxt` skips text inside `{@tags}` unless `tagInsensitive`, and by
 *     default only touches bare strings + `entries`/`headerEntries`/
 *     `footerEntries` of array items — exactly the site's behaviour.
 *   - Homebrew extension kept: `valueExpression` (`[[baseItem.value]] * 2`).
 *   - Compatibility: an `inherits.x` mod path on an entity with no `inherits`
 *     object falls back to `x` (older homebrew data relied on this).
 *
 * MODULES
 *   copy-math.ts (helpers + statblock math), copy-variables.ts
 *   (`<$…$>` variables), copy-mods.ts (`_mod` modes), copy-versions.ts
 *   (`_versions`). This file keeps the trace, preserve rules and applyCopy.
 */
import type { Entity } from '../types.ts';
import { safeArithmetic } from './arithmetic.ts';
import { isObj, type Obj } from '../../util.ts';
import { asArray, clone, deletePath, getPath } from './copy-math.ts';
import { resolveVariables } from './copy-variables.ts';
import { MODES, ModError } from './copy-mods.ts';

// --- trace ------------------------------------------------------------------------

export type TraceKind =
  | 'inherit'
  | 'drop'
  | 'delete'
  | 'template'
  | 'root'
  | 'mod'
  | 'variable'
  | 'version';

export interface TraceStep {
  kind: TraceKind;
  /** Property (path) the step touched; `*` / `_` for the special mod keys. */
  prop: string;
  /** `_mod` mode, when kind === 'mod'. */
  mode?: string;
  /** Human-readable account of what happened. */
  detail: string;
  ok: boolean;
}

export interface CopyTrace {
  steps: TraceStep[];
  errors: string[];
  warnings: string[];
}

export const newTrace = (): CopyTrace => ({
  steps: [],
  errors: [],
  warnings: [],
});

// --- preserve rules -----------------------------------------------------------------

/** Parent fields removed on copy unless `_preserve`d (DataUtil.generic). */
export const MERGE_REQUIRES_PRESERVE_BASE = new Set([
  'page',
  'otherSources',
  'referenceSources',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'hasFluff',
  'hasFluffImages',
  'hasToken',
  'tokenCredit',
  'tokenCustom',
  'foundryTokenScale',
  'altArt',
  '_versions',
]);

/** Per-prop additions (DataUtil.<prop>._MERGE_REQUIRES_PRESERVE). */
export const MERGE_REQUIRES_PRESERVE_BY_PROP: Record<string, Set<string>> = {
  monster: new Set([
    'legendaryGroup',
    'environment',
    'soundClip',
    'altArt',
    'variant',
    'dragonCastingColor',
    'familiar',
  ]),
  item: new Set(['lootTables', 'tier']),
  baseitem: new Set(['lootTables', 'tier']),
  magicvariant: new Set(['lootTables', 'tier']),
};

/** Entry-bearing props a `*` mod key fans out to (DataUtil.generic.COPY_ENTRY_PROPS). */
export const COPY_ENTRY_PROPS = [
  'action',
  'bonus',
  'reaction',
  'trait',
  'legendary',
  'mythic',
  'variant',
  'spellcasting',
  'actionHeader',
  'bonusHeader',
  'reactionHeader',
  'legendaryHeader',
  'mythicHeader',
];

// --- the applier ---------------------------------------------------------------------------

export interface Template {
  name?: string;
  source?: string;
  apply?: { _root?: Obj; _mod?: Record<string, unknown> };
}

export interface ApplyCopyOptions {
  /** Array prop (for per-type preserve rules). */
  prop?: string;
  /** Available templates (e.g. `monsterTemplate`) for `_copy._templates`. */
  templates?: Template[];
  trace?: CopyTrace;
}

const describeMod = (m: unknown): string => {
  if (m === 'remove') return 'remove';
  if (!isObj(m)) return JSON.stringify(m);
  const { mode, ...rest } = m;
  const s = JSON.stringify(rest);
  return `${String(mode)} ${s.length > 120 ? `${s.slice(0, 117)}…` : s}`;
};

function resolvePath(copyTo: Obj, prop: string): string[] {
  const path = prop.split('.');
  // Legacy compat: `inherits.x` on an entity without `inherits` targets `x`.
  if (path[0] === 'inherits' && path.length > 1 && !isObj(copyTo.inherits))
    return path.slice(1);
  return path;
}

/**
 * Apply `child._copy` onto a copy of `parent`, exactly as the site's
 * copyApplier.getCopy does. Returns a NEW entity; neither input is mutated.
 */
export function applyCopy(
  parent: Entity,
  child: Entity,
  opts: ApplyCopyOptions = {},
): Entity {
  const trace = opts.trace ?? newTrace();
  const copyFrom = clone(parent) as Obj;
  const copyTo = clone(child) as Obj;
  const copyMeta = (isObj(copyTo._copy) ? copyTo._copy : {}) as Obj;

  // Normalise mods to arrays (clone — never mutate the caller's data).
  const mods: Record<string, unknown[]> = {};
  for (const [k, v] of Object.entries((copyMeta._mod as Obj) ?? {}))
    mods[k] = asArray(v);

  // Templates: their _mod is appended after the entity's own.
  const templates: Template[] = [];
  for (const ref of asArray(copyMeta._templates) as Obj[]) {
    const nm = String(ref?.name ?? '')
      .toLowerCase()
      .trim();
    const src = String(ref?.source ?? '')
      .toLowerCase()
      .trim();
    const t = (opts.templates ?? []).find(
      (x) =>
        String(x.name ?? '')
          .toLowerCase()
          .trim() === nm &&
        String(x.source ?? '')
          .toLowerCase()
          .trim() === src,
    );
    if (!t) {
      trace.errors.push(`template "${ref?.name}" (${ref?.source}) not found`);
      continue;
    }
    templates.push(clone(t));
    trace.steps.push({
      kind: 'template',
      prop: '',
      detail: `applied template "${t.name}" (${t.source})`,
      ok: true,
    });
    for (const [k, v] of Object.entries(t.apply?._mod ?? {}))
      mods[k] = (mods[k] ?? []).concat(asArray(v));
  }
  if (templates.length)
    copyTo._copy_templates = templates.map(({ name, source }) => ({
      name,
      source,
    }));

  const rootProps = new Set(Object.keys(copyTo));
  const preserve = (copyMeta._preserve ?? {}) as Obj;
  const extra = MERGE_REQUIRES_PRESERVE_BY_PROP[opts.prop ?? ''];

  // Base copy.
  for (const k of Object.keys(copyFrom)) {
    if (copyTo[k] === null) {
      delete copyTo[k];
      trace.steps.push({
        kind: 'delete',
        prop: k,
        detail: `"${k}": null removes the inherited value`,
        ok: true,
      });
      continue;
    }
    if (copyTo[k] != null) continue; // child's own value wins
    if (MERGE_REQUIRES_PRESERVE_BASE.has(k) || extra?.has(k)) {
      if (preserve['*'] || preserve[k]) {
        copyTo[k] = copyFrom[k];
        trace.steps.push({
          kind: 'inherit',
          prop: k,
          detail: 'inherited (preserved)',
          ok: true,
        });
      } else {
        trace.steps.push({
          kind: 'drop',
          prop: k,
          detail: `not inherited — add "_preserve": {"${k}": true} to keep it`,
          ok: true,
        });
      }
      continue;
    }
    copyTo[k] = copyFrom[k];
    trace.steps.push({
      kind: 'inherit',
      prop: k,
      detail: 'inherited from parent',
      ok: true,
    });
  }

  // Template root props (never overwrite real root props).
  for (const t of templates) {
    for (const [k, v] of Object.entries(t.apply?._root ?? {})) {
      if (rootProps.has(k)) continue;
      copyTo[k] = clone(v);
      trace.steps.push({
        kind: 'root',
        prop: k,
        detail: `set by template "${t.name}"`,
        ok: true,
      });
    }
  }

  // Mods: `_` and `*` last, variables resolved against the merged entity first.
  const order = (k: string): number => ['_', '*'].indexOf(k);
  for (const [prop, rawInfos] of Object.entries(mods).sort(
    ([a], [b]) => order(a) - order(b),
  )) {
    const infos = resolveVariables(rawInfos, copyTo, trace) as unknown[];
    const paths: (string[] | null)[] =
      prop === '*'
        ? COPY_ENTRY_PROPS.map((p) => [p])
        : prop === '_'
          ? [null]
          : [resolvePath(copyTo, prop)];
    for (const info of infos) {
      for (const path of paths) {
        const label = path ? path.join('.') : '_';
        const step: TraceStep = {
          kind: 'mod',
          prop: prop === '*' ? `*→${label}` : label,
          mode: info === 'remove' ? 'remove' : String((info as Obj)?.mode),
          detail: describeMod(info),
          ok: true,
        };
        // `*` fans out to every entry prop; only trace the ones it changed.
        const before =
          prop === '*' && path ? JSON.stringify(getPath(copyTo, path)) : null;
        try {
          if (info === 'remove') {
            if (!path) throw new ModError('"remove" needs a property key');
            deletePath(copyTo, path);
          } else if (typeof info === 'string') {
            throw new ModError(`unhandled mode "${info}"`);
          } else {
            const fn = MODES[String((info as Obj).mode)];
            if (!fn)
              throw new ModError(
                `unhandled mode "${String((info as Obj).mode)}"`,
              );
            fn({ copyTo, modInfo: info as Obj, path });
          }
        } catch (err) {
          // `*` fans out to every entry prop; a missing one there is normal.
          if (prop === '*' && err instanceof ModError) continue;
          step.ok = false;
          step.detail += ` — FAILED: ${(err as Error).message}`;
          trace.errors.push(
            `_mod "${step.prop}" (${step.mode}): ${(err as Error).message}`,
          );
        }
        if (
          step.ok &&
          before !== null &&
          before === JSON.stringify(getPath(copyTo, path!))
        )
          continue;
        trace.steps.push(step);
      }
    }
  }

  // Homebrew extension: derived value.
  if (typeof copyTo.valueExpression === 'string') {
    const expr = copyTo.valueExpression.replace(
      /\[\[baseItem\.value\]\]/g,
      String((copyFrom.value as number) || 0),
    );
    const result = safeArithmetic(expr);
    if (result !== null) copyTo.value = result;
    else
      trace.warnings.push(
        `valueExpression "${copyTo.valueExpression}" is not valid arithmetic`,
      );
    delete copyTo.valueExpression;
  }

  copyTo._isCopy = true;
  delete copyTo._copy;
  return copyTo as Entity;
}
