/**
 * scripts/lib/guide-checks.ts — in-process runners for guide coverage audit
 * and generated guide enum lists, shared by `scripts/audit.ts`,
 * `scripts/guide-enums.ts`, `scripts/upstream-check.ts`, and
 * `scripts/upstream-update.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  GUIDE_MAP,
  unmappedGuides,
} from '../../src/lib/engine/audit/guide-map.ts';
import {
  getEntityProperties,
  getEntityBranches,
  getRelatedKeys,
  type SchemaMap,
} from '../../src/lib/engine/audit/schema.ts';
import {
  auditGuide,
  auditGuideBranched,
  toSummary,
  aggregateAudit,
  type GuideAuditResult,
  type BranchedGuideAudit,
  type AuditSummaryRow,
  type AuditAggregate,
} from '../../src/lib/engine/audit/audit.ts';
import { regenerateGuideLists } from '../../src/lib/engine/audit/guide-enums.ts';

export interface GuideAuditReport {
  schemaCount: number;
  badJson: number;
  summary: AuditSummaryRow[];
  aggregate: AuditAggregate;
  details: Record<string, GuideAuditResult>;
  branched: Record<string, BranchedGuideAudit>;
  failing: AuditSummaryRow[];
  branchFailing: [string, BranchedGuideAudit][];
  skipped: string[];
  problems: number;
}

export function runGuideAudit(
  schemas: SchemaMap,
  guidesDir: string,
  badJson = 0,
): GuideAuditReport {
  const guideCache = new Map<string, string>();
  const readGuide = (file: string): string => {
    if (!guideCache.has(file)) {
      const p = path.join(guidesDir, file);
      guideCache.set(file, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
    }
    return guideCache.get(file) ?? '';
  };

  const details: Record<string, GuideAuditResult> = {};
  const branched: Record<string, BranchedGuideAudit> = {};
  const skipped: string[] = [];

  for (const [guideFile, map] of Object.entries(GUIDE_MAP)) {
    const schemaProperties = getEntityProperties(
      schemas,
      map.schema,
      map.rootRef,
    );
    if (!schemaProperties) {
      skipped.push(
        `${guideFile} (rootRef unresolved: ${map.schema}${map.rootRef})`,
      );
      continue;
    }
    const guideContent = readGuide(guideFile);
    if (!guideContent) {
      skipped.push(`${guideFile} (guide file missing)`);
      continue;
    }
    const parentContent = map.parentGuide
      ? readGuide(map.parentGuide)
      : undefined;
    const related = getRelatedKeys(schemas, map.related);
    for (const ref of related.unresolved)
      skipped.push(`${guideFile} (related ref unresolved: ${ref})`);
    details[guideFile] = auditGuide({
      guideContent,
      parentContent,
      schemaProperties,
      relatedKeys: related.keys,
    });

    const schemaBranches = getEntityBranches(schemas, map.schema, map.rootRef);
    if (schemaBranches) {
      branched[guideFile] = auditGuideBranched({
        guideContent,
        parentContent,
        branches: schemaBranches.map((b) => ({
          name: b.name,
          schemaProperties: b.properties,
        })),
        relatedKeys: related.keys,
      });
    }
  }

  for (const file of unmappedGuides(fs.readdirSync(guidesDir)))
    skipped.push(`${file} (no GUIDE_MAP entry, so never audited)`);

  const summary = toSummary(details);
  const aggregate = aggregateAudit(summary);
  const failing = summary.filter((r) => r.coverage < 100 || r.extra > 0);
  const branchFailing = Object.entries(branched).filter(
    ([, b]) => b.coverage < 100,
  );
  const problems =
    failing.length + branchFailing.length + skipped.length + badJson;

  return {
    schemaCount: Object.keys(schemas).length,
    badJson,
    summary,
    aggregate,
    details,
    branched,
    failing,
    branchFailing,
    skipped,
    problems,
  };
}

export function formatGuideAudit(
  report: GuideAuditReport,
  opts: { quiet?: boolean } = {},
): string[] {
  const quiet = opts.quiet ?? false;
  const lines: string[] = [];

  lines.push(
    `Guide coverage — ${report.schemaCount} schema files, ${report.summary.length} guides`,
    '',
  );

  if (!quiet) {
    for (const r of [...report.summary].sort(
      (a, b) => a.coverage - b.coverage || a.guide.localeCompare(b.guide),
    )) {
      const mark = r.coverage === 100 && r.extra === 0 ? '  ' : '✖ ';
      lines.push(
        `${mark}${String(r.coverage).padStart(3)}%  ${r.guide.padEnd(36)} ${String(r.total).padStart(4)} props` +
          (r.missing ? `  missing ${r.missing}` : '') +
          (r.extra ? `  extra ${r.extra}` : ''),
      );
    }
    lines.push('');
  }

  for (const r of report.failing) {
    const d = report.details[r.guide];
    const why =
      r.coverage < 100 ? `${r.coverage}% coverage` : 'stale property name(s)';
    lines.push(`✖ ${r.guide} — ${why}`);
    if (d.undocumentedCount)
      lines.push(
        `    undocumented: ${d.undocumentedProperties.map((p) => p.name).join(', ')}`,
      );
    if (d.guideOnlyCount)
      lines.push(
        `    documented but not in schema: ${d.guideOnlyProperties.join(', ')}`,
      );
  }

  if (Object.keys(report.branched).length && !quiet) {
    lines.push('Multi-shape entities (per-branch coverage):');
    for (const [guide, b] of Object.entries(report.branched)) {
      lines.push(`  ${guide} — worst ${b.coverage}% (${b.worstBranch})`);
      for (const r of b.branches) {
        lines.push(
          `      ${r.coverage === 100 ? ' ' : '✖'} ${String(r.coverage).padStart(3)}%  ${r.branch.padEnd(30)} ${String(r.totalSchemaProperties).padStart(4)} props` +
            (r.undocumentedCount
              ? `  missing: ${r.undocumentedProperties
                  .map((p) => p.name)
                  .slice(0, 12)
                  .join(', ')}`
              : ''),
        );
      }
    }
    lines.push('');
  }

  for (const [guide, b] of report.branchFailing) {
    lines.push(
      `✖ ${guide} — branch "${b.worstBranch}" at ${b.coverage}% (union view reads ${report.details[guide]?.coverage ?? '?'}%)`,
    );
  }

  if (report.skipped.length) {
    lines.push('Skipped:');
    for (const s of report.skipped) lines.push(`  - ${s}`);
    lines.push('');
  }

  const agg = report.aggregate;
  lines.push(
    `Overall: ${agg.coverage}% — ${agg.documented}/${agg.totalFields} properties documented across ${agg.guides} guides`,
  );

  if (report.problems) {
    lines.push(
      '',
      `✖ audit failed — ${report.problems} problem(s). If the schemas were just synced, the guides need updating.`,
    );
  } else {
    lines.push('✓ all guides at 100%');
  }

  return lines;
}

export interface GuideEnumReport {
  total: number;
  stale: number;
  unknown: number;
  rewritten: number;
  files: { file: string; problems: string[] }[];
  lines: string[];
}

export function runGuideEnums(
  schemas: SchemaMap,
  guidesDir: string,
  opts: { write?: boolean } = {},
): GuideEnumReport {
  const write = opts.write ?? false;
  let stale = 0;
  let unknown = 0;
  let total = 0;
  let rewritten = 0;
  const files: { file: string; problems: string[] }[] = [];
  const lines: string[] = [];

  for (const file of fs
    .readdirSync(guidesDir)
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const p = path.join(guidesDir, file);
    const md = fs.readFileSync(p, 'utf8');
    const out = regenerateGuideLists(md, schemas);
    total += out.total;
    unknown += out.unknown;
    if (!out.problems.length) continue;
    stale += out.problems.length;
    files.push({ file, problems: out.problems });
    lines.push(`${file}\n  ${out.problems.join('\n  ')}`);
    if (write && out.next !== md) {
      fs.writeFileSync(p, out.next);
      rewritten += out.problems.length - out.unknown;
    }
  }

  lines.push('', `${total} generated list(s) checked.`);
  if (stale && !write) {
    lines.push(`✖ ${stale} problem(s). Run: npm run guides:enums -- --write`);
  } else if (write && stale) {
    lines.push(`✔ rewrote ${rewritten} list(s).`);
  } else if (!unknown) {
    lines.push('✔ all lists match the schema.');
  }

  return { total, stale, unknown, rewritten, files, lines };
}
