/**
 * GET /api/guides            → { guides: [{ file, label, group, entityType, arrayProp }] }
 * GET /api/guides?file=<f>   → raw guide markdown (text/markdown)
 *
 * `group` is 'guide' (schema-backed conversion guide) or 'doc' (reference
 * documentation). Files marked hidden in DOC_MAP are omitted from the list.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listGuideEntries, readGuide } from '$lib/services/guide-service';

export const GET: RequestHandler = async ({ url }) => {
  const file = url.searchParams.get('file');

  if (file) {
    try {
      const md = await readGuide(file);
      return new Response(md, {
        headers: { 'content-type': 'text/markdown; charset=utf-8' },
      });
    } catch {
      throw error(404, `Guide not found: ${file}`);
    }
  }

  return json({ guides: await listGuideEntries() });
};
