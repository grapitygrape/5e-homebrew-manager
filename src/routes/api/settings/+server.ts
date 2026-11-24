/**
 * GET /api/settings — the Settings view (effective config + per-source status).
 * PUT /api/settings { <field>: text } — save the form, as settings-service reads it.
 */
import { json } from '@sveltejs/kit';
import { apiHandler, parseJsonObject } from '$lib/server/http';
import {
  saveSettings,
  settingsView,
  type SettingsFields,
} from '$lib/services/settings-service';

export const GET = apiHandler(async () => json(await settingsView()));

export const PUT = apiHandler(async ({ request }) => {
  const body = await parseJsonObject(request, 'an object of form fields');
  return json(await saveSettings(body as SettingsFields));
});
