/**
 * GET /api/data-font/<file> — a font from the data folder's fonts/, for the
 * app's own pages (lib/data-fonts). 404 when it isn't there.
 */
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { join } from '$lib/fs/path';
import { configProvider } from '$lib/services/config';
import { isFontFileName } from '$lib/data-fonts';

export const GET: RequestHandler = async ({ params }) => {
  if (!isFontFileName(params.name))
    throw error(400, `${params.name} is not a font file name.`);
  const file = join(configProvider().root(), 'fonts', params.name);
  const bytes = await readFile(file).catch(() => null);
  if (!bytes) throw error(404, `${params.name} is not in the data folder's fonts.`);
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'font/woff2', 'cache-control': 'no-cache' },
  });
};
