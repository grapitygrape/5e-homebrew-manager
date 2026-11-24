/**
 * engine/merge/copy.ts — resolve 5etools `_copy` directives.
 *
 * INTENT
 *   Given an entity with a `_copy` block and a map of candidate parents, produce
 *   the fully-merged entity. The actual application (preserve rules, `_mod`
 *   modes, templates, variables) lives in copy-applier.ts — a faithful port of
 *   the site's copyApplier — so this merge path and the resolved-entity
 *   preview (`resolveCopyTraced`) produce identical results. Pure and
 *   synchronous. See guides/Spec_Copy.md.
 *
 * REUSE NOTES
 *   - `getEntityKey` / `getParentKey` are the identity rules for matching a copy
 *     to its base; merge.ts reuses `getEntityKey` to build the lookup map.
 *   - `safeArithmetic` moved to arithmetic.ts; re-exported here for callers.
 */
import type { Entity, CopyDirective } from '../types.ts';
import { applyCopy, newTrace } from './copy-applier.ts';
import type { CopyTrace, Template } from './copy-applier.ts';

export { safeArithmetic } from './arithmetic.ts';

const lc = (v: unknown): string =>
  typeof v === 'string' ? v.toLowerCase() : '';

/** Identity key for an entity of a given type (mirrors 5etools' hashing inputs). */
export function getEntityKey(
  entity: Record<string, unknown>,
  type: string,
): string {
  if (!entity) return '';
  const parts: (string | number)[] = [lc(entity.name), lc(entity.source)];
  if (type === 'classFeature' || type === 'subclassFeature') {
    if (entity.className) parts.push(lc(entity.className));
    if (entity.classSource) parts.push(lc(entity.classSource));
    if (entity.level !== undefined) parts.push(entity.level as number);
  }
  if (type === 'subclassFeature') {
    const subShort = entity.subclassShortName || entity.shortName;
    if (subShort) parts.push(lc(subShort));
    const subSrc = entity.subclassSource || entity.subSource;
    if (subSrc) parts.push(lc(subSrc));
  }
  if (type === 'subclass') {
    if (entity.className) parts.push(lc(entity.className));
    if (entity.classSource) parts.push(lc(entity.classSource));
  }
  return parts.join('__');
}

/** Identity key for the parent referenced by a `_copy` block. */
export function getParentKey(copyMeta: CopyDirective, type: string): string {
  return getEntityKey(copyMeta as Record<string, unknown>, type);
}

/**
 * Resolve `entity._copy` against `entityMap` (key → entity). Returns a new
 * merged entity (with `_isCopy: true`); if the parent can't be found the
 * entity is returned with `_copy` stripped.
 */
export function resolveCopy(
  entity: Entity,
  entityMap: Record<string, Entity>,
  type: string,
  visited: Set<string> = new Set(),
  templates?: Template[],
): Entity {
  return resolveCopyTraced(entity, entityMap, type, { templates, visited })
    .entity;
}

/** One link in a `_copy` chain, child-most first. */
export interface CopyChainLink {
  name: string;
  source: string;
  /** Where the parent was found: 'homebrew' file name, 'official', or null. */
  origin: string | null;
}

export interface TracedCopy {
  entity: Entity;
  /** Parents walked, nearest first. */
  chain: CopyChainLink[];
  trace: CopyTrace;
}

/**
 * Resolve a `_copy` chain and keep the full trace (every inherited/dropped
 * prop, every mod, every failure) — the data behind the resolved preview.
 * Parent traces are folded in, prefixed with their name, so a multi-level
 * chain explains itself end to end.
 */
export function resolveCopyTraced(
  entity: Entity,
  entityMap: Record<string, Entity>,
  type: string,
  opts: { templates?: Template[]; visited?: Set<string> } = {},
): TracedCopy {
  const trace = newTrace();
  if (!entity || !entity._copy) return { entity, chain: [], trace };

  const visited = opts.visited ?? new Set<string>();
  const key = getEntityKey(entity as Record<string, unknown>, type);
  const copyMeta = entity._copy;
  const parentKey = getParentKey(copyMeta, type);

  if (parentKey === key) {
    trace.errors.push('_copy references the entity itself');
    const cleaned = { ...entity };
    delete cleaned._copy;
    return { entity: cleaned, chain: [], trace };
  }
  if (key && visited.has(key)) {
    trace.errors.push(`circular _copy chain through "${entity.name}"`);
    return { entity, chain: [], trace };
  }

  const parent = entityMap[parentKey];
  if (!parent) {
    trace.errors.push(
      `parent "${copyMeta.name}" (${copyMeta.source ?? 'no source'}) not found`,
    );
    const cleaned = { ...entity };
    delete cleaned._copy;
    return { entity: cleaned, chain: [], trace };
  }

  const nextVisited = new Set(visited);
  if (key) nextVisited.add(key);
  const up = resolveCopyTraced(parent, entityMap, type, {
    templates: opts.templates,
    visited: nextVisited,
  });
  for (const s of up.trace.steps)
    if (s.kind === 'mod' || s.kind === 'template')
      trace.steps.push({ ...s, detail: `[${parent.name}] ${s.detail}` });
  trace.errors.push(...up.trace.errors.map((e) => `[${parent.name}] ${e}`));
  trace.warnings.push(...up.trace.warnings.map((w) => `[${parent.name}] ${w}`));

  const merged = applyCopy(up.entity, entity, {
    prop: type,
    templates: opts.templates,
    trace,
  });
  // The resolved parent is itself a copy artefact; don't leak its flag.
  const link: CopyChainLink = {
    name: String(parent.name ?? ''),
    source: String(parent.source ?? ''),
    origin:
      parent._isHomebrew === false
        ? 'official'
        : ((parent._homebrewFile as string | undefined) ?? null),
  };
  return { entity: merged, chain: [link, ...up.chain], trace };
}
