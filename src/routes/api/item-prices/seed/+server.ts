/**
 * GET /api/item-prices/seed - homebrew sources that carry item values.
 * GET /api/item-prices/seed?source=X - price rows from X's values, sources prefilled.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  seedItemPrices,
  seedSources,
} from '$lib/services/item-prices-service';

export const GET: RequestHandler = async ({ url }) => {
  const source = url.searchParams.get('source');
  try {
    return json(source ? await seedItemPrices(source) : await seedSources());
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
