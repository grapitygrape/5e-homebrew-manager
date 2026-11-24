/** GET /api/item-prices/names - every item name the site shows, with its sources. */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { itemNameSources } from '$lib/services/item-prices-service';

export const GET: RequestHandler = async () => {
  try {
    return json(await itemNameSources());
  } catch (e) {
    throw error(500, (e as Error).message);
  }
};
