/**
 * lib/services/validate-service.ts — fast document validation + link audit.
 *
 * INTENT
 *   One place that pairs the shallow structural pass (`engine/audit/validate.ts`:
 *   required top-level fields, unknown top-level keys, basic shape sanity) with
 *   the content-link audit (`link-service` index). Intentionally shallow so
 *   multi-file scans (`/files`, `/files/add`, `/api/validate`,
 *   `/api/homebrew-scan`, fix prompts) stay fast and degrade gracefully when
 *   full brew schemas aren't configured.
 *
 *   Full JSON-Schema validation matching 5etools-utils CI runs separately via
 *   Ajv in `engine/audit/schema-validate.ts` (loaded on demand in the Parser
 *   through `schema-validator-client.ts`).
 *
 * SHAPE NOTES
 *   - Schema messages carry both `message` (plain text, for agents/hovers) and
 *     `html` (the UI form with <code> markers for click-to-navigate).
 *   - Link issues are engine LinkIssues: severity, msg (HTML), plain, at
 *     (top-level property), raw (exact tag text to search for).
 */
import { entitySchemaForType } from './schema-service';
import { getLinkIndex } from './link-service';
import {
  parseHomebrewFile,
  applyLinkChecks,
  BARE_SCHEMA,
} from '$lib/engine/audit';
import type { EntitySchema, LinkIssue, ParseTotals } from '$lib/engine/audit';

export interface IssueMessage {
  message: string;
  html: string;
}

export interface EntityIssues {
  type: string;
  entityIdx: number;
  name: string | null;
  schemaErrors: IssueMessage[];
  schemaWarnings: IssueMessage[];
  linkErrors: LinkIssue[];
  linkWarnings: LinkIssue[];
}

export interface DocumentValidation {
  totals: ParseTotals;
  types: string[];
  issues: EntityIssues[];
}

const stripHtml = (s: string): string => s.replace(/<[^>]+>/g, '');
const toMessage = (html: string): IssueMessage => ({
  message: stripHtml(html),
  html,
});

/** Validate a whole homebrew document: top-level schema checks + content links. */
export async function validateDocument(
  data: Record<string, unknown>,
): Promise<DocumentValidation> {
  const types = Object.keys(data).filter(
    (k) => Array.isArray(data[k]) && (data[k] as unknown[]).length > 0,
  );
  const schemaByType = new Map<string, EntitySchema>();
  await Promise.all(
    types.map(async (t) => schemaByType.set(t, await entitySchemaForType(t))),
  );

  const parsed = parseHomebrewFile(
    data,
    (t) => schemaByType.get(t) ?? BARE_SCHEMA,
  );
  const links = applyLinkChecks(data, parsed, await getLinkIndex());
  const linkByKey = new Map(
    links.nodes.map((n) => [`${n.type}:${n.entityIdx}`, n]),
  );

  const issues: EntityIssues[] = [];
  for (const n of parsed.nodes) {
    const li = linkByKey.get(`${n.type}:${n.entityIdx}`);
    if (!n.errors.length && !n.warnings.length && !li) continue;
    issues.push({
      type: n.type,
      entityIdx: n.entityIdx,
      name: (n.entity.name ?? n.entity.id ?? null) as string | null,
      schemaErrors: n.errors.map(toMessage),
      schemaWarnings: n.warnings.map(toMessage),
      linkErrors: li?.errors ?? [],
      linkWarnings: li?.warnings ?? [],
    });
  }
  return { totals: parsed.totals, types: parsed.types, issues };
}
