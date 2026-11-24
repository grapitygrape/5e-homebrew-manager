/**
 * lib/services/audit-service.ts — run the guide-coverage audit on demand.
 *
 * INTENT
 *   For every guide in GUIDE_MAP: resolve its schema's top-level properties,
 *   read the guide markdown (+ parent guide for inheritance), and score coverage
 *   with the pure, tested engine.auditGuide. Memoized — the schema load and
 *   guide reads are the only I/O; pass force=true to recompute.
 */
import { cachedResource, getDataSource } from './datasource';
import { getSchemasCached } from './schema-service';
import { mapPool } from '$lib/util';
import {
  GUIDE_MAP,
  getEntityProperties,
  getEntityBranches,
  getRelatedKeys,
  auditGuide,
  auditGuideBranched,
  toSummary,
} from '$lib/engine/audit';
import type {
  GuideAuditResult,
  AuditSummaryRow,
  BranchedGuideAudit,
} from '$lib/engine/audit';

export interface AuditReport {
  timestamp: number;
  summary: AuditSummaryRow[];
  details: Record<string, GuideAuditResult>;
  /**
   * Per-shape coverage, only for entities whose schema is a real `oneOf`/`anyOf`
   * union (currently `vehicle`). The union figure in `details` answers "which legal
   * properties are undocumented anywhere"; this answers "how well is each actual
   * shape documented" — and cannot be inflated by a large inherited parentGuide.
   */
  branched: Record<string, BranchedGuideAudit>;
}

async function buildAudit(): Promise<AuditReport> {
  const ds = getDataSource();
  const guideFiles = new Set<string>();
  for (const [guideFile, map] of Object.entries(GUIDE_MAP)) {
    guideFiles.add(guideFile);
    if (map.parentGuide) guideFiles.add(map.parentGuide);
  }
  const fileList = [...guideFiles];
  const [schemas, guideTexts] = await Promise.all([
    getSchemasCached(),
    mapPool(fileList, (file) => ds.getGuide(file).catch(() => '')),
  ]);
  const guideCache = new Map<string, string>(
    fileList.map((file, i) => [file, guideTexts[i]]),
  );

  const details: Record<string, GuideAuditResult> = {};
  const branched: Record<string, BranchedGuideAudit> = {};
  for (const [guideFile, map] of Object.entries(GUIDE_MAP)) {
    const schemaProperties = getEntityProperties(
      schemas,
      map.schema,
      map.rootRef,
    );
    if (!schemaProperties) continue;
    const guideContent = guideCache.get(guideFile) ?? '';
    if (!guideContent) continue; // guide file absent → skip (not a 0% penalty)
    const parentContent = map.parentGuide
      ? (guideCache.get(map.parentGuide) ?? '')
      : undefined;
    const relatedKeys = getRelatedKeys(schemas, map.related).keys;
    details[guideFile] = auditGuide({
      guideContent,
      parentContent,
      schemaProperties,
      relatedKeys,
    });

    // Discriminated-union entities get a second, per-shape score alongside the union.
    const schemaBranches = getEntityBranches(schemas, map.schema, map.rootRef);
    if (schemaBranches) {
      branched[guideFile] = auditGuideBranched({
        guideContent,
        parentContent,
        branches: schemaBranches.map((b) => ({
          name: b.name,
          schemaProperties: b.properties,
        })),
        relatedKeys,
      });
    }
  }

  return {
    timestamp: Date.now(),
    summary: toSummary(details),
    details,
    branched,
  };
}

const auditCache = cachedResource(buildAudit);

export const resetAudit = (): void => auditCache.reset();

export const isAuditReady = (): boolean => auditCache.isReady();

export const runAudit = (force = false): Promise<AuditReport> =>
  auditCache.get(force);
