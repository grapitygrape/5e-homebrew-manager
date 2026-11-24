/**
 * lib/services/guide-list-service.ts — check, and regenerate, the value lists
 * the guides take from the brew schemas.
 *
 * INTENT
 *   The same work as `npm run guides:enums`, for Deploy Site's Review: once
 *   Prepare has moved 5etools-utils, the lists can be brought up to date
 *   without a terminal. Rendering lives in engine/audit/guide-enums.ts.
 */
import { fs, path } from '$lib/fs';
import { regenerateGuideLists } from '$lib/engine/audit';
import { getDataSource } from './datasource';
import { getSchemasCached } from './schema-service';
import { configProvider } from './config';

export interface GuideListsReport {
  /** `file: problem`, one per stale, unknown or unrenderable list. */
  problems: string[];
  /** Guides rewritten (0 unless writing). */
  rewritten: number;
}

/** The local guides folder, for writing. */
function guidesDir(): string {
  const ref = configProvider().effectiveConfig().guides;
  if (!ref.path)
    throw new Error(
      'The guides are configured as a URL, so they cannot be rewritten here.',
    );
  return path.resolve(configProvider().root(), ref.path);
}

export async function checkGuideLists(
  write = false,
): Promise<GuideListsReport> {
  const ds = getDataSource();
  const schemas = await getSchemasCached();
  const dir = write ? guidesDir() : '';
  const problems: string[] = [];
  let rewritten = 0;
  for (const file of await ds.listGuides()) {
    const md = await ds.getGuide(file);
    const out = regenerateGuideLists(md, schemas);
    if (write && out.next !== md) {
      await fs().writeText(path.join(dir, file), out.next);
      rewritten++;
    }
    // A rewrite fixes everything but the lists it couldn't render.
    const left = write
      ? out.problems.filter(
          (p) => !p.startsWith('stale') && !p.startsWith('legacy'),
        )
      : out.problems;
    problems.push(...left.map((p) => `${file}: ${p}`));
  }
  return { problems, rewritten };
}
