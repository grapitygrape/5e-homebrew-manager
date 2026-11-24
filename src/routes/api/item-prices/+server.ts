/**
 * GET /api/item-prices - `content/item-prices.json`, normalised.
 * PUT /api/item-prices - overwrite it. Body: `{ rows }`. The previous file is
 * rotated to `.bak` first.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import {
  loadItemPrices,
  saveItemPrices,
} from '$lib/services/item-prices-service';
import type { ItemPrice } from '$lib/engine/item-prices.ts';

export const GET = apiHandler(async () => json(await loadItemPrices()));

export const PUT = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request);
  if (!Array.isArray(body.rows)) throw badRequest('Expected a "rows" array.');
  return json(await saveItemPrices(body.rows as ItemPrice[]));
});
