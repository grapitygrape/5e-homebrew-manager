import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pkg from '../../../../package.json';

const startedAt = Date.now();

export const GET: RequestHandler = () => {
  const containerMode = process.env.HBM_CONTAINER === '1';
  return json({
    ok: true,
    name: pkg.name,
    version: pkg.version,
    runtime: containerMode ? 'container' : 'node',
    uptimeMs: Date.now() - startedAt,
  });
};
