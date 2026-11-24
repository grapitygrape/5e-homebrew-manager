/**
 * GET /api/site-icons/<css|font> — Font Awesome Pro from the Tools source
 * checkout, for the app's own icons (lib/site-icons). 404 until it's there.
 */
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toolsRepoPath } from '$lib/data';
import { join } from '$lib/fs/path';
import { configProvider } from '$lib/services/config';
import { SITE_ICON_FILES, isSiteIconFile } from '$lib/site-icons';

const TYPES = { css: 'text/css; charset=utf-8', font: 'font/woff2' };

export const GET: RequestHandler = async ({ params }) => {
  if (!isSiteIconFile(params.file))
    throw error(400, `${params.file} is not a site icon file.`);
  const provider = configProvider();
  const tools = toolsRepoPath(
    provider.stored().sourceRepos,
    provider.effectiveConfig(),
  );
  const bytes = tools
    ? await readFile(join(tools, SITE_ICON_FILES[params.file])).catch(
        () => null,
      )
    : null;
  if (!bytes) throw error(404, 'The Tools source checkout has no icons yet.');
  return new Response(new Uint8Array(bytes), {
    headers: {
      'content-type': TYPES[params.file],
      'cache-control': 'no-cache',
    },
  });
};
