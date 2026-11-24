/**
 * GET /api/shops/:file - the shop with its entries resolved.
 * PUT /api/shops/:file - overwrite it; the old file is kept as `.bak`.
 * DELETE /api/shops/:file - rename it to `.bak`.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteShop, openShop, saveShop } from '$lib/services/shop-service';
import type { ShopFile } from '$lib/engine/shop-list.ts';

export const GET: RequestHandler = async ({ params }) => {
  try {
    return json(await openShop(params.file));
  } catch (e) {
    throw error(404, (e as Error).message);
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Request body is not valid JSON.');
  }
  try {
    await saveShop(params.file, body as ShopFile);
    return json({ ok: true });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteShop(params.file);
    return json({ ok: true });
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
