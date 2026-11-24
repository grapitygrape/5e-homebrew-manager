/**
 * lib/blocklist.js — the manager's content blocklist, shaped for Neptunium's
 * World Content Blocklist. Pure; no Foundry globals, so the tests can run it.
 *
 * WHY A WORLD SETTING
 *   Neptunium doesn't read content-blocklist.json. It swaps 5etools' browser
 *   storage for its own world setting, `plutonium.blacklist`, and filters
 *   every importer with that. The homebrew file only reaches it as an embedded
 *   blocklist, which can add rules but never remove them, so an unblock on
 *   the site would never reach Foundry.
 */

/** Neptunium's module id (still Plutonium's) and the setting holding its blocklist. */
export const NEPTUNIUM_ID = 'plutonium';
export const NEPTUNIUM_BLOCKLIST_KEY = 'blacklist';

/** 5etools' exact-match identity for a rule. */
const ruleKey = (r) => `${r.hash}__${r.category}__${r.source}`.toLowerCase();

const filled = (v) => typeof v === 'string' && v.length > 0;

/**
 * The list the world should hold: the manager's rules, replacing whatever the
 * world had, plus Neptunium's own auto-managed rows (its "Rules Version" option)
 * the manager doesn't already cover. Without those, Neptunium would only add
 * them back on the next world load.
 * @param {unknown[]} incoming the manager's rules
 * @param {unknown[]} current the world's list as it stands
 */
export function mergeWorldBlocklist(incoming, current) {
  const out = [];
  const seen = new Set();
  const take = (r, isAuto) => {
    if (!r || typeof r !== 'object') return;
    const { hash, category, source } = r;
    // 5etools refuses a rule missing any of the three, so Neptunium would too.
    if (!filled(hash) || !filled(category) || !filled(source)) return;
    const key = ruleKey(r);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      displayName: filled(r.displayName) ? r.displayName : hash,
      hash,
      category,
      source,
      isAuto,
    });
  };

  for (const r of Array.isArray(incoming) ? incoming : [])
    take(r, r?.isAuto === true);
  for (const r of Array.isArray(current) ? current : [])
    if (r?.isAuto === true) take(r, true);
  return out;
}
