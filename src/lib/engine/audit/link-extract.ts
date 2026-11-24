/**
 * engine/audit/link-extract.ts — find every content reference in an entity:
 * inline `{@tag}` links, `_copy`, `baseItem`, class/subclass/race wiring,
 * prerequisite lists and magicvariant `requires`/`excludes` matchers.
 * link-check.ts checks what this returns against a LinkIndex.
 *
 * INLINE TAGS vs REQUIRED BLOCKS (the important distinction)
 *   - Inline `{@tag Name|Source|Display}` tags are *name links*: the first pipe
 *     part is a content name, the source part (position varies by tag — the
 *     shared engine/tag-registry encodes it) is a source abbreviation. Both are
 *     checkable. The registry is also what the renderer uses, so audit and
 *     display semantics can't drift apart.
 *   - magicvariant `requires` / `excludes` blocks are *property matchers*, not
 *     name links: `{"type": "A|XPHB"}` means "applies to base items of type A",
 *     so the value is a type/property CODE, not a content name. Treating those
 *     as name links would flood the audit with false errors. We only link-check
 *     a matcher when its key is `name` (a literal base-item name), and for coded
 *     values we validate just the `|source` suffix when present.
 */
import type { Entity } from '../types.ts';
import { LINK_TAGS, NON_LINK_TAGS, splitLinkTag } from '../tag-registry.ts';

// --- what a reference looks like ---------------------------------------------

export type RefKind =
  'tag' | 'copy' | 'structural' | 'requires' | 'prerequisite' | 'format';

export interface ContentRef {
  kind: RefKind;
  /** Target array prop the name should exist under (may have fallbacks). */
  props: string[];
  /** Referenced content name (raw casing). */
  name: string;
  /** Explicit source abbreviation, if the ref carries one. */
  source?: string;
  /** Inline tags only: the source 5etools assumes when `source` is absent. */
  defaultSource?: string;
  /** Top-level entity property the ref was found under (for navigation). */
  at: string;
  /** Raw text of the reference as it appears in the file (for editor marks). */
  raw: string;
  /** kind 'format' only: what's wrong with the enricher's syntax. */
  problem?: { severity: 'error' | 'warning'; reason: string };
}

// --- tag → target-prop map ----------------------------------------------------

/**
 * Derived from the shared registry (engine/tag-registry.ts): every link
 * enricher and the array prop(s) its target lives under. Kept as an export for
 * compatibility/introspection; add new tags in the registry, not here.
 */
export const TAG_TARGETS: Record<string, string[]> = Object.fromEntries(
  Object.entries(LINK_TAGS).map(([tag, def]) => [tag, def.props]),
);

const TAG_RE = /\{@([a-zA-Z][a-zA-Z0-9]*) ([^{}]+)\}/g;

// --- extraction ----------------------------------------------------------------

export const asStr = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null;

/** Split "name|source" (used by baseItem, attachedSpells, prerequisite.feat, …). */
function splitNameSource(raw: string): { name: string; source?: string } {
  const [name, source] = raw.split('|');
  return { name: name.trim(), source: source?.trim() || undefined };
}

/** Strip 5etools spell-list suffixes like "fireball#c" / "#x". */
const stripSpellSuffix = (name: string): string =>
  name.replace(/#[a-z]+$/i, '');

/** Collect inline-tag refs from every string in `value` (deep). */
function collectTagRefs(value: unknown, at: string, out: ContentRef[]): void {
  if (typeof value === 'string') {
    TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TAG_RE.exec(value))) {
      const def = LINK_TAGS[m[1]];
      if (!def) {
        // Known formatting/dice tag → fine. Unknown tag → format warning (typo?).
        if (!NON_LINK_TAGS.has(m[1])) {
          out.push({
            kind: 'format',
            props: [],
            name: '',
            at,
            raw: m[0],
            problem: {
              severity: 'warning',
              reason: `unknown enricher tag @${m[1]}`,
            },
          });
        }
        continue;
      }
      const { name, source, effectiveDefault } = splitLinkTag(def, m[2]);
      if (!def.props.length) {
        // Unverifiable target (e.g. quickref): still validate the source part.
        if (source)
          out.push({ kind: 'tag', props: [], name: '', source, at, raw: m[0] });
        continue;
      }
      if (!name) {
        out.push({
          kind: 'format',
          props: [],
          name: '',
          at,
          raw: m[0],
          problem: {
            severity: 'error',
            reason: `invalid format — @${m[1]} is missing its name`,
          },
        });
        continue;
      }
      out.push({
        kind: 'tag',
        props: def.props,
        name,
        source,
        defaultSource: source ? undefined : effectiveDefault,
        at,
        raw: m[0],
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectTagRefs(v, at, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectTagRefs(v, at, out);
  }
}

/**
 * Refs from a magicvariant `requires`/`excludes` block. Property matchers, NOT
 * name links (see header): only `name` keys are content names; coded values
 * only get their `|source` suffix checked.
 */
function collectRequiresRefs(
  block: unknown,
  at: string,
  out: ContentRef[],
): void {
  const matchers = Array.isArray(block)
    ? block
    : block && typeof block === 'object'
      ? [block]
      : [];
  for (const matcher of matchers) {
    if (!matcher || typeof matcher !== 'object') continue;
    for (const [key, val] of Object.entries(
      matcher as Record<string, unknown>,
    )) {
      const vals = Array.isArray(val) ? val : [val];
      for (const v of vals) {
        const s = asStr(v);
        if (!s) continue;
        if (key === 'name') {
          const { name, source } = splitNameSource(s);
          out.push({
            kind: 'requires',
            props: ['baseitem', 'item'],
            name,
            source,
            at,
            raw: s,
          });
        } else if (s.includes('|')) {
          // Coded matcher ("A|XPHB") — validate only the source suffix.
          const { source } = splitNameSource(s);
          if (source)
            out.push({
              kind: 'requires',
              props: [],
              name: '',
              source,
              at,
              raw: s,
            });
        }
      }
    }
  }
}

/** Structured (non-tag) references for one entity. */
function collectStructuredRefs(
  entity: Entity,
  type: string,
  out: ContentRef[],
): void {
  const e = entity as Record<string, unknown>;

  // _copy → same array prop, explicit name+source.
  const copy = e._copy as Record<string, unknown> | undefined;
  if (copy && typeof copy === 'object' && asStr(copy.name)) {
    out.push({
      kind: 'copy',
      props: [type],
      name: copy.name as string,
      source: asStr(copy.source) ?? undefined,
      at: '_copy',
      raw: `"_copy": ${copy.name}`,
    });
  }

  // Class/subclass/race wiring.
  const cls = asStr(e.className);
  if (cls && ['subclass', 'classFeature', 'subclassFeature'].includes(type)) {
    out.push({
      kind: 'structural',
      props: ['class'],
      name: cls,
      source: asStr(e.classSource) ?? undefined,
      at: 'className',
      raw: cls,
    });
  }
  const scName = asStr(e.subclassShortName);
  if (scName && type === 'subclassFeature') {
    out.push({
      kind: 'structural',
      props: ['subclass'],
      name: scName,
      source: asStr(e.subclassSource) ?? undefined,
      at: 'subclassShortName',
      raw: scName,
    });
  }
  const raceName = asStr(e.raceName);
  if (raceName && type === 'subrace') {
    out.push({
      kind: 'structural',
      props: ['race'],
      name: raceName,
      source: asStr(e.raceSource) ?? undefined,
      at: 'raceName',
      raw: raceName,
    });
  }

  // Item family: baseItem, itemGroup.items, packContents, attachedSpells.
  const baseItem = asStr(e.baseItem);
  if (baseItem) {
    const { name, source } = splitNameSource(baseItem);
    out.push({
      kind: 'structural',
      props: ['baseitem', 'item'],
      name,
      source,
      at: 'baseItem',
      raw: baseItem,
    });
  }
  if (Array.isArray(e.items)) {
    for (const it of e.items) {
      const s = asStr(it);
      if (!s || s.includes('{@')) continue; // tagged entries handled by the tag pass
      const { name, source } = splitNameSource(s);
      out.push({
        kind: 'structural',
        props: ['item', 'baseitem', 'itemGroup', 'magicvariant'],
        name,
        source,
        at: 'items',
        raw: s,
      });
    }
  }
  if (Array.isArray(e.packContents)) {
    for (const pc of e.packContents) {
      const s = asStr(pc) ?? asStr((pc as Record<string, unknown>)?.item);
      if (!s) continue;
      const { name, source } = splitNameSource(s);
      out.push({
        kind: 'structural',
        props: ['item', 'baseitem'],
        name,
        source,
        at: 'packContents',
        raw: s,
      });
    }
  }
  if (Array.isArray(e.attachedSpells)) {
    for (const sp of e.attachedSpells) {
      const s = asStr(sp);
      if (!s) continue;
      const { name, source } = splitNameSource(stripSpellSuffix(s));
      out.push({
        kind: 'structural',
        props: ['spell'],
        name,
        source,
        at: 'attachedSpells',
        raw: s,
      });
    }
  }

  // Prerequisites: feat/spell/optionalfeature entries are "name|source" strings.
  if (Array.isArray(e.prerequisite)) {
    for (const pre of e.prerequisite) {
      if (!pre || typeof pre !== 'object') continue;
      const p = pre as Record<string, unknown>;
      const lists: [string, string[]][] = [
        ['feat', ['feat']],
        ['spell', ['spell']],
        ['optionalfeature', ['optionalfeature']],
      ];
      for (const [key, props] of lists) {
        const arr = p[key];
        if (!Array.isArray(arr)) continue;
        for (const entry of arr) {
          const s = asStr(entry);
          if (!s) continue;
          const { name, source } = splitNameSource(stripSpellSuffix(s));
          out.push({
            kind: 'prerequisite',
            props,
            name,
            source,
            at: 'prerequisite',
            raw: s,
          });
        }
      }
    }
  }

  // magicvariant Required blocks (and excludes).
  if (e.requires !== undefined)
    collectRequiresRefs(e.requires, 'requires', out);
  if (e.excludes !== undefined)
    collectRequiresRefs(e.excludes, 'excludes', out);
}

/** All content refs for one entity: structured first, then inline tags per top-level prop. */
export function extractEntityRefs(entity: Entity, type: string): ContentRef[] {
  const out: ContentRef[] = [];
  collectStructuredRefs(entity, type, out);
  for (const [key, val] of Object.entries(entity as Record<string, unknown>)) {
    if (key === 'requires' || key === 'excludes') continue; // matchers, not prose
    collectTagRefs(val, key, out);
  }
  return out;
}
