/** Shops opens on its first subtab. */
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = () => {
  redirect(307, '/shops/lists');
};
