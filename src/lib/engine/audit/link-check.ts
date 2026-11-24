/**
 * engine/audit/link-check.ts — broken-content-link audit.
 *
 * INTENT
 *   Find references from homebrew entities to other content ({@item x|Src}
 *   inline tags, `_copy`, `baseItem`, class/subclass wiring, prerequisite
 *   lists, magicvariant `requires`/`excludes` blocks) and verify each target
 *   exists — in official data or in any homebrew file — so broken links are
 *   caught before they 404 in 5etools. Pure: extraction + checking take a
 *   prebuilt LinkIndex; the server owns building it (see services/link-service).
 *
 * MODULES
 *   link-extract.ts finds the refs, link-index.ts builds the index, and this
 *   file checks one against the other and decorates ParsedHomebrew nodes.
 *
 * UNSOURCED TAGS RESOLVE TO A FIXED DEFAULT, NOT "ANYWHERE"
 *   5etools fills a missing source from the tag's default (render.js
 *   `defaultSource` — PHB for spells, DMG for items, MM for creatures; every
 *   one a 2014 book). So `{@spell My Brew Spell}` can never reach homebrew and
 *   `{@item longsword}` points at longsword|DMG, which doesn't exist. When the
 *   name exists elsewhere but not under the default, that's a dead link →
 *   ERROR, with the source(s) that would fix it.
 *
 * 2014 / 2024 EDITION MISMATCHES
 *   A file's `_meta.edition` ("one" = 2024, default "classic"). In a 2024
 *   brew, a link — explicit or defaulted — to a legacy entity that has a
 *   `reprintedAs` target is almost always a mistake → WARNING naming the
 *   reprint. (A classic brew linking modern sources is a per-file CI failure;
 *   the submission linter reports that.)
 *
 * SEVERITY MODEL (deliberately conservative — no false errors)
 *   - Explicit source that is one of *our* homebrew sources, or a type we index
 *     official data for → target must exist → ERROR when missing.
 *   - Explicit source we've never heard of → WARNING (probably a typo, but it
 *     could be official content outside our index).
 *   - No source and the name isn't found anywhere we index → WARNING when we
 *     have official coverage for that type, silence otherwise (it's likely
 *     official content we simply don't load, e.g. bestiary).
 *
 * REUSE NOTES
 *   - Messages embed `<code>topLevelProp</code>` FIRST so the Parser's
 *     click-to-navigate (extractPropName) jumps to the offending property.
 *   - `applyLinkChecks` decorates ParsedNodes in place with linkErrors /
 *     linkWarnings and returns per-node structured issues (raw tag text +
 *     property) so the editor can mark the exact broken tag.
 */
import type { Entity } from '../types.ts';
import type { ParsedHomebrew, ParsedNode } from './homebrew-parse.ts';
import { escapeHtml } from '../../util.ts';
import { extractEntityRefs } from './link-extract.ts';
import type { ContentRef, RefKind } from './link-extract.ts';
import { buildLocalIndex } from './link-index.ts';
import type { LinkIndex } from './link-index.ts';

export interface LinkIssue {
  severity: 'error' | 'warning';
  /** HTML message (first <code> is the top-level prop, for navigation). */
  msg: string;
  /** Plain-text reason — safe for `title` hover attributes. */
  plain: string;
  /** Raw ref text, so the editor/renderer can mark the exact span. */
  raw: string;
  at: string;
}

// --- checking -----------------------------------------------------------------

const KIND_LABEL: Record<RefKind, string> = {
  tag: 'link',
  copy: '_copy link',
  structural: 'reference',
  requires: 'requires matcher',
  prerequisite: 'prerequisite',
  format: 'enricher',
};

/** Check one entity's refs — the convenience the render API and single-entity
 *  link-check share. Returns deduped issues in extraction order. */
export function checkEntity(
  entity: Entity,
  type: string,
  index: LinkIndex,
  local?: LinkIndex,
  ctx: LinkContext = {},
): LinkIssue[] {
  const out: LinkIssue[] = [];
  const seen = new Set<string>();
  for (const ref of extractEntityRefs(entity, type)) {
    const issue = checkRef(ref, index, local, ctx);
    if (!issue) continue;
    const key = `${issue.severity}|${issue.msg}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

/** Issues keyed by raw tag text — the shape render/tags.ts consumes for
 *  inline highlighting of the real rendered output. */
export function issuesByRaw(
  issues: LinkIssue[],
): Map<string, { severity: 'error' | 'warning'; reason: string }> {
  const map = new Map<
    string,
    { severity: 'error' | 'warning'; reason: string }
  >();
  for (const i of issues) {
    // Errors win when the same span is flagged twice.
    if (!map.has(i.raw) || i.severity === 'error')
      map.set(i.raw, { severity: i.severity, reason: i.plain });
  }
  return map;
}

/** File-level context a ref is checked in. */
export interface LinkContext {
  /** The file's `_meta.edition` ("classic" when unset, matching the repo CI). */
  edition?: 'classic' | 'one';
}

/** The edition a brew document declares (repo CI treats absent as classic). */
export const docEdition = (doc: Record<string, unknown>): 'classic' | 'one' =>
  (doc._meta as { edition?: unknown } | undefined)?.edition === 'one'
    ? 'one'
    : 'classic';

/** Sources (original casing) a name exists in across `props`, both indexes. */
function sourcesFor(
  props: string[],
  nameLc: string,
  indexes: (LinkIndex | undefined)[],
): string[] {
  const out = new Set<string>();
  for (const idx of indexes)
    for (const p of props)
      for (const s of idx?.sourcesByName.get(p)?.get(nameLc) ?? []) out.add(s);
  return [...out].sort();
}

/** `reprintedAs` of name|source across `props`, if the target was reprinted. */
function reprintFor(
  props: string[],
  nameLc: string,
  srcLc: string,
  index: LinkIndex,
): string | null {
  for (const p of props) {
    const r = index.reprints.get(p)?.get(`${nameLc}|${srcLc}`);
    if (r) return r;
  }
  return null;
}

/**
 * Check one ref against the index (plus an optional local overlay — the file
 * being edited, whose entities count even before it's saved).
 */
export function checkRef(
  ref: ContentRef,
  index: LinkIndex,
  local?: LinkIndex,
  ctx: LinkContext = {},
): LinkIssue | null {
  // The message pair: `plain` for hover titles, `msg` (HTML) for issue lists —
  // first <code> in msg is the top-level prop so click-to-navigate works.
  const issue = (severity: 'error' | 'warning', plain: string): LinkIssue => ({
    severity,
    plain,
    msg: `<code>${escapeHtml(ref.at)}</code>: ${escapeHtml(plain)}`,
    raw: ref.raw,
    at: ref.at,
  });

  // Malformed enricher — detected during extraction, reported as-is.
  if (ref.kind === 'format' && ref.problem)
    return issue(ref.problem.severity, `${ref.problem.reason} — ${ref.raw}`);

  const srcLc = ref.source?.toLowerCase();
  const nameLc = ref.name.toLowerCase();
  const sourceKnown =
    !srcLc ||
    index.knownSources.has(srcLc) ||
    (local?.knownSources.has(srcLc) ?? false);

  // Source-only checks (coded requires matchers have no name).
  if (!ref.name) {
    if (srcLc && !sourceKnown)
      return issue('warning', `unknown source "${ref.source}" in ${ref.raw}`);
    return null;
  }

  const hasName = (idx: LinkIndex): boolean =>
    ref.props.some((p) => idx.byProp.get(p)?.has(nameLc));
  const hasPairOf = (idx: LinkIndex, s: string): boolean =>
    ref.props.some((p) => idx.byPropSource.get(p)?.has(`${nameLc}|${s}`));
  const hasPair = (idx: LinkIndex): boolean => !!srcLc && hasPairOf(idx, srcLc);

  // 2024 brew linking a legacy entity that has a 2024 reprint.
  const editionIssue = (srcOfTarget: string, how: string): LinkIssue | null => {
    if (ctx.edition !== 'one') return null;
    // Only official 2014 books: homebrew-to-homebrew reprints aren't editions.
    if (index.sourceEdition.get(srcOfTarget) !== 'classic') return null;
    const reprint = reprintFor(ref.props, nameLc, srcOfTarget, index);
    if (!reprint) return null;
    const [rName, rSrc] = reprint.split('|');
    return issue(
      'warning',
      `${ref.raw} ${how} the 2014 version (${srcOfTarget.toUpperCase()}) in a 2024 ("edition": "one") brew — it was reprinted as "${rName}" (${rSrc}); link that instead`,
    );
  };

  // Unsourced inline tag: 5etools resolves it against ONE default source.
  if (!srcLc && ref.defaultSource) {
    const defLc = ref.defaultSource.toLowerCase();
    if (hasPairOf(index, defLc) || (local && hasPairOf(local, defLc)))
      return editionIssue(defLc, 'has no source, so it links');
    const elsewhere = sourcesFor(ref.props, nameLc, [index, local]);
    if (elsewhere.length) {
      const fix = elsewhere
        .slice(0, 3)
        .map((s) => `|${s}`)
        .join(' or ');
      // Without official data for this type we can't see what the default
      // source holds, so it may well resolve there.
      if (!ref.props.some((p) => index.officialProps.has(p)))
        return issue(
          'warning',
          `possible dead link ${ref.raw} — with no source 5etools looks in ${ref.defaultSource}, and "${ref.name}" was only found in ${elsewhere.join(', ')}; if ${ref.defaultSource} has no such ${ref.props[0]}, add ${fix}`,
        );
      return issue(
        'error',
        `dead link ${ref.raw} — with no source 5etools looks in ${ref.defaultSource}, but "${ref.name}" is only in ${elsewhere.join(', ')}; add ${fix}`,
      );
    }
    // Not found anywhere: fall through to the generic unsourced handling.
  }

  if (srcLc) {
    if (!sourceKnown)
      return issue('warning', `unknown source "${ref.source}" in ${ref.raw}`);
    if (hasPair(index) || (local && hasPair(local)))
      return editionIssue(srcLc, 'links');
    const isHomebrewSrc =
      index.homebrewSources.has(srcLc) ||
      (local?.homebrewSources.has(srcLc) ?? false);
    const covered =
      isHomebrewSrc || ref.props.some((p) => index.officialProps.has(p));
    if (!covered) return null; // can't verify (unindexed official content)
    if (hasName(index) || (local && hasName(local))) {
      return issue(
        'warning',
        `"${ref.name}" exists, but not in source "${ref.source}" — broken ${KIND_LABEL[ref.kind]} ${ref.raw}`,
      );
    }
    return issue(
      'error',
      `broken ${KIND_LABEL[ref.kind]} ${ref.raw} — no ${ref.props[0]} named "${ref.name}" in "${ref.source}"`,
    );
  }

  // No source: only flag when we have full official coverage for the target type.
  if (hasName(index) || (local && hasName(local))) return null;
  if (!ref.props.some((p) => index.officialProps.has(p))) return null;
  return issue(
    'warning',
    `broken ${KIND_LABEL[ref.kind]} ${ref.raw} — no ${ref.props[0]} named "${ref.name}" found`,
  );
}

// --- ParsedHomebrew integration --------------------------------------------------

export interface NodeLinkIssues {
  type: string;
  entityIdx: number;
  errors: LinkIssue[];
  warnings: LinkIssue[];
}

export interface LinkCheckResult {
  nodes: NodeLinkIssues[];
  totals: { brokenLinks: number; linkWarnings: number };
}

/**
 * Run the link audit over a parsed file: extract refs per node, check against
 * `index` (+ the file's own content), decorate nodes (linkErrors/linkWarnings
 * + totals) in place, and return structured issues for editor decoration.
 */
export function applyLinkChecks(
  doc: Record<string, unknown>,
  parsed: ParsedHomebrew,
  index: LinkIndex,
): LinkCheckResult {
  const local = buildLocalIndex(doc);
  const out: NodeLinkIssues[] = [];
  let brokenLinks = 0,
    linkWarnings = 0;

  const ctx: LinkContext = { edition: docEdition(doc) };
  for (const node of parsed.nodes) {
    const issues = checkEntity(node.entity, node.type, index, local, ctx);
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');
    if (errors.length || warnings.length) {
      out.push({
        type: node.type,
        entityIdx: node.entityIdx,
        errors,
        warnings,
      });
      applyToNode(node, errors, warnings);
      brokenLinks += errors.length;
      linkWarnings += warnings.length;
    }
  }

  parsed.totals.brokenLinks = brokenLinks;
  parsed.totals.linkWarnings = linkWarnings;
  return { nodes: out, totals: { brokenLinks, linkWarnings } };
}

/** Attach link issues to a node (kept separate from schema errors — filterable). */
export function applyToNode(
  node: ParsedNode,
  errors: LinkIssue[],
  warnings: LinkIssue[],
): void {
  node.linkErrors = errors.map((i) => i.msg);
  node.linkWarnings = warnings.map((i) => i.msg);
}
