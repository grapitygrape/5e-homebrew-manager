/**
 * lib/services/guide-service.ts — the guides folder as the Guides view sees it.
 *
 * `group` is 'guide' (schema-backed conversion guide) or 'doc' (reference
 * documentation). Files docGroupFor() hides are left out.
 */
import { getDataSource } from './datasource';
import { GUIDE_MAP, DOC_MAP, docGroupFor } from '$lib/engine/audit';
import { guideTitle } from '$lib/util';

export interface GuideEntry {
  file: string;
  label: string;
  group: 'guide' | 'doc';
  entityType: string | null;
  arrayProp: string | null;
}

export async function listGuideEntries(): Promise<GuideEntry[]> {
  const files = await getDataSource().listGuides();
  const out: GuideEntry[] = [];
  for (const file of files) {
    const group = docGroupFor(file);
    if (group === null) continue;
    out.push({
      file,
      label: GUIDE_MAP[file]?.label ?? DOC_MAP[file]?.label ?? guideTitle(file),
      group,
      entityType: GUIDE_MAP[file]?.entityType ?? null,
      arrayProp: GUIDE_MAP[file]?.arrayProp ?? null,
    });
  }
  return out;
}

/** Raw guide markdown. Rejects when the file can't be read. */
export function readGuide(file: string): Promise<string> {
  return getDataSource().getGuide(file);
}
