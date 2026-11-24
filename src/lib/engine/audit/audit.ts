/**
 * engine/audit/audit.ts — measure how well a conversion guide documents its schema.
 *
 * INTENT
 *   Coverage = documented top-level properties / total top-level properties.
 *   A guide "documents" a property by naming it in a prop-card or property table
 *   (NOT every backtick — that would count sub-properties from JSON examples and
 *   inflate the number). Pure: feed it guide markdown + the schema's property
 *   list and it returns the report. Ported from audit.js.
 *
 * REUSE NOTES
 *   - Schema loading + GUIDE_MAP iteration is the caller's job (data layer);
 *     this stays pure so it runs in CI, on the server, or in the browser.
 */
import type { NamedProperty } from './schema.ts';

export interface GuideAuditResult {
  coverage: number;
  totalSchemaProperties: number;
  undocumentedCount: number;
  undocumentedProperties: NamedProperty[];
  guideOnlyCount: number;
  guideOnlyProperties: string[];
  schemaProperties: NamedProperty[];
  requiredProperties: string[];
}

/**
 * Property names a guide explicitly documents. Two recognised formats:
 *   1. <div class="prop-card-key"><code>name</code>…</div>
 *   2. <td><code>name</code></td>  (first cell of a property table row)
 * Deliberately NOT every <code>/backtick — that picks up JSON-example noise.
 */
export function extractGuideKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  const add = (k: string) => {
    k = (k || '').trim();
    if (k) keys.add(k);
  };

  for (const m of markdown.matchAll(
    /<div class="prop-card-key">([\s\S]*?)<\/div>/g,
  )) {
    for (const c of m[1].matchAll(/<code>([a-zA-Z_$][a-zA-Z0-9_$]*)<\/code>/g))
      add(c[1]);
  }
  for (const m of markdown.matchAll(
    /<td>\s*<code>([a-zA-Z_$][a-zA-Z0-9_$]*)<\/code>\s*<\/td>/g,
  ))
    add(m[1]);
  return keys;
}

export interface AuditGuideInput {
  guideContent: string;
  /** Optional parent guide markdown whose documented keys count toward coverage. */
  parentContent?: string;
  /** Authoritative top-level property list from the schema (schema.getEntityProperties). */
  schemaProperties: NamedProperty[];
  /**
   * Keys of related definitions the guide also documents (GuideMapEntry.related).
   * Legitimate guide keys, so never reported as guide-only; not scored for coverage.
   */
  relatedKeys?: Iterable<string>;
}

/** Audit one guide against its schema's top-level property surface. */
export function auditGuide({
  guideContent,
  parentContent,
  schemaProperties,
  relatedKeys,
}: AuditGuideInput): GuideAuditResult {
  const guideKeys = extractGuideKeys(guideContent);
  const effectiveKeys = new Set(guideKeys);
  if (parentContent)
    for (const k of extractGuideKeys(parentContent)) effectiveKeys.add(k);

  const schemaNames = new Set(schemaProperties.map((p) => p.name));
  for (const k of relatedKeys ?? []) schemaNames.add(k);

  const undocumented = schemaProperties
    .filter((p) => !effectiveKeys.has(p.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const guideOnly = [...guideKeys].filter((k) => !schemaNames.has(k)).sort();

  const total = schemaProperties.length;
  const coverage =
    total > 0 ? Math.round(((total - undocumented.length) / total) * 100) : 100;

  return {
    coverage,
    totalSchemaProperties: total,
    undocumentedCount: undocumented.length,
    undocumentedProperties: undocumented,
    guideOnlyCount: guideOnly.length,
    guideOnlyProperties: guideOnly,
    schemaProperties,
    requiredProperties: schemaProperties
      .filter((p) => p.required)
      .map((p) => p.name)
      .sort(),
  };
}

/** Coverage of one alternative shape of a discriminated-union entity. */
export interface BranchAuditResult extends GuideAuditResult {
  /** Branch label, from SchemaBranch.name. */
  branch: string;
}

export interface AuditGuideBranchedInput {
  guideContent: string;
  parentContent?: string;
  /** Alternative shapes, from schema.getEntityBranches. */
  branches: { name: string; schemaProperties: NamedProperty[] }[];
  relatedKeys?: Iterable<string>;
}

export interface BranchedGuideAudit {
  /** Per-shape coverage, in schema branch order. */
  branches: BranchAuditResult[];
  /**
   * Headline coverage = the WORST branch, not the average or the union.
   *
   * A guide is only as good as the legal shape it documents least well: if one
   * branch is undocumented, an author writing that shape gets no help. Averaging
   * would let four well-documented branches hide a fifth that is missing entirely,
   * and the union figure can be inflated by a `parentGuide` that happens to
   * document a large inherited surface.
   */
  coverage: number;
  /** Branch name that produced `coverage`. */
  worstBranch: string;
}

/**
 * Audit a guide against each alternative shape of a `oneOf`/`anyOf` entity.
 * Use when schema.getEntityBranches returns branches; otherwise use auditGuide.
 */
export function auditGuideBranched({
  guideContent,
  parentContent,
  branches,
  relatedKeys,
}: AuditGuideBranchedInput): BranchedGuideAudit {
  const related = relatedKeys ? [...relatedKeys] : undefined;
  const results: BranchAuditResult[] = branches.map((b) => ({
    branch: b.name,
    ...auditGuide({
      guideContent,
      parentContent,
      schemaProperties: b.schemaProperties,
      relatedKeys: related,
    }),
  }));

  let worst: BranchAuditResult | null = null;
  for (const r of results) if (!worst || r.coverage < worst.coverage) worst = r;

  return {
    branches: results,
    coverage: worst ? worst.coverage : 100,
    worstBranch: worst ? worst.branch : '',
  };
}

export interface AuditSummaryRow {
  guide: string;
  coverage: number;
  total: number;
  missing: number;
  extra: number;
}

/** Flatten a `{ guide: GuideAuditResult }` map into dashboard summary rows. */
export function toSummary(
  details: Record<string, GuideAuditResult>,
): AuditSummaryRow[] {
  return Object.entries(details).map(([guide, r]) => ({
    guide,
    coverage: r.coverage,
    total: r.totalSchemaProperties,
    missing: r.undocumentedCount,
    extra: r.guideOnlyCount,
  }));
}

export interface AuditAggregate {
  guides: number;
  totalFields: number;
  documented: number;
  missing: number;
  extra: number;
  /** Overall coverage % across all guides (documented / total). */
  coverage: number;
}

/** Roll a guide summary up into the dashboard's headline numbers. */
export function aggregateAudit(summary: AuditSummaryRow[]): AuditAggregate {
  let totalFields = 0,
    missing = 0,
    extra = 0;
  for (const s of summary) {
    totalFields += s.total;
    missing += s.missing;
    extra += s.extra;
  }
  const documented = totalFields - missing;
  return {
    guides: summary.length,
    totalFields,
    documented,
    missing,
    extra,
    coverage: totalFields ? Math.round((documented / totalFields) * 100) : 100,
  };
}
