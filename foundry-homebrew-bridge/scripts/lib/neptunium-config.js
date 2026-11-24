/**
 * lib/neptunium-config.js — merge the manager's Neptunium settings into the
 * world's Neptunium config. Pure; no Foundry globals.
 *
 * Neptunium keeps its whole config in one world setting, `plutonium.config`,
 * shaped `{ group: { key: value } }`. It has no API to change it, and reads it
 * once at load, so a write only takes effect after the GM reloads.
 */

/** The world setting that holds Neptunium's config. */
export const NEPTUNIUM_CONFIG_KEY = 'config';

/** Only the groups and keys the manager sets, so a bad payload can't reach the rest. */
const ALLOWED = {
  dataSources: {
    isPlayerUseBlocklist: 'boolean',
    isGmUseBlocklist: 'boolean',
    isLoadLocalHomebrewIndex: 'boolean',
    localHomebrewDirectoryPath: 'string',
    isUseLocalHomebrewIndexJson: 'boolean',
    baseSiteUrl: 'string',
    baseMediaUrlImg: 'string',
    baseMediaUrlAudio: 'string',
    baseMediaUrlFonts: 'string',
  },
};

/**
 * @param {unknown} current the world's config as stored (may be `{}` before
 *   Neptunium first saves it; it fills defaults on load)
 * @param {unknown} wanted `{ group: { key: value } }` from the manager
 * @returns {{ next: Record<string, Record<string, unknown>>, changed: { group: string, key: string, from: unknown, to: unknown }[] }}
 */
export function mergeNeptuniumConfig(current, wanted) {
  const base = current && typeof current === 'object' ? current : {};
  const next = { ...base };
  const changed = [];
  for (const [group, keys] of Object.entries(ALLOWED)) {
    const asked = wanted?.[group];
    if (!asked || typeof asked !== 'object') continue;
    for (const [key, type] of Object.entries(keys)) {
      const to = asked[key];
      if (typeof to !== type) continue;
      const from = base[group]?.[key];
      if (from === to) continue;
      next[group] = { ...(next[group] ?? {}), [key]: to };
      changed.push({ group, key, from, to });
    }
  }
  return { next, changed };
}
