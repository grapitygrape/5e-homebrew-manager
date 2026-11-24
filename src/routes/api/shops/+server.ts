/**
 * GET /api/shops - every shop in `content/shops/`.
 * POST /api/shops - `{ name }` makes an empty shop; `{ import, name }` makes one
 * from a 5etools "Export list" file, with `name` as the fallback name.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, badRequest, parseJsonObject } from '$lib/server/http';
import { createShop, importShop, listShops } from '$lib/services/shop-service';
import { errorText } from '$lib/util';

export const GET = apiHandler(async () => json(await listShops()));

export const POST = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request);
  const name = typeof body.name === 'string' ? body.name : '';
  try {
    return json(
      body.import === undefined
        ? await createShop(name)
        : await importShop(body.import, name || 'Imported list'),
    );
  } catch (e) {
    throw badRequest(errorText(e));
  }
});
