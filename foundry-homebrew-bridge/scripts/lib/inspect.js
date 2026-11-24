/**
 * lib/inspect.js — the three completeness checks, run against a raw Foundry
 * document (or compendium index entry).
 *
 * PURE. Same contract as lib/match.js: no Foundry globals, no DOM, no imports,
 * so the manager's Vitest suite imports this file directly. HTML stripping is
 * done with a regex rather than DOMParser precisely to keep that true — we only
 * need "is there any prose here", not a faithful parse.
 *
 * WHAT COUNTS AS PRESENT
 *   image        `img` is set and isn't one of Foundry's `icons/svg/…`
 *                placeholders. A real piece of art lives under `icons/` (core
 *                art packs), `systems/`, `modules/`, or your data folder.
 *   description  `system.description.value` has non-whitespace text once tags
 *                and `&nbsp;` are removed. `<p></p>` does not count.
 *   activities   `system.activities` (dnd5e 4.x+) has at least one entry.
 *                NOTE: plenty of items legitimately have zero — a passive
 *                wondrous item, a lore-only trinket. The report flags it so you
 *                can decide; it is not automatically a defect.
 */

/**
 * Foundry's built-in placeholder art. Everything under `icons/svg/` is a
 * monochrome silhouette shipped for exactly this "nothing chosen yet" purpose.
 */
const PLACEHOLDER_IMG = /^\/?icons\/svg\//i;

/** Where prose lives, per document class. First non-empty wins. */
const DESCRIPTION_PATHS = [
  'system.description.value',
  'system.description.chat',
  'system.details.biography.value',
  'system.details.value',
];

/**
 * Read a dotted path off an object without throwing.
 * @param {unknown} obj
 * @param {string} path
 * @returns {unknown}
 */
export function getPath(obj, path) {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[key];
  }
  return cur;
}

/**
 * Is `img` real art rather than a Foundry placeholder?
 * @param {unknown} img
 * @returns {boolean}
 */
export function hasRealImage(img) {
  const value = String(img ?? '').trim();
  if (!value) return false;
  return !PLACEHOLDER_IMG.test(value);
}

/**
 * Tags out, entities decoded enough to spot whitespace-only prose.
 * @param {unknown} html
 * @returns {string}
 */
export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} doc raw document / index entry
 * @returns {{ hasDescription: boolean, descriptionChars: number }}
 */
export function describeDescription(doc) {
  for (const path of DESCRIPTION_PATHS) {
    const text = stripHtml(getPath(doc, path));
    if (text.length > 0)
      return { hasDescription: true, descriptionChars: text.length };
  }
  return { hasDescription: false, descriptionChars: 0 };
}

/**
 * dnd5e stores activities as an id-keyed object; older shapes and index
 * projections can come through as an array. Both are handled.
 *
 * @param {unknown} doc raw document / index entry
 * @returns {{ activityCount: number, activityTypes: string[] }}
 */
export function describeActivities(doc) {
  const raw = getPath(doc, 'system.activities');
  if (!raw || typeof raw !== 'object')
    return { activityCount: 0, activityTypes: [] };

  const entries = Array.isArray(raw) ? raw : Object.values(raw);
  const types = new Set();
  let count = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    count++;
    const type = /** @type {Record<string, unknown>} */ (entry).type;
    if (typeof type === 'string' && type) types.add(type);
  }

  return { activityCount: count, activityTypes: [...types].sort() };
}

/**
 * dnd5e records provenance under `system.source`; it may be a legacy string or
 * a `{ book, custom, page }` object.
 * @param {unknown} doc
 * @returns {string}
 */
export function readSource(doc) {
  const src = getPath(doc, 'system.source');
  if (typeof src === 'string') return src.trim();
  if (src && typeof src === 'object') {
    const o = /** @type {Record<string, unknown>} */ (src);
    return String(o.custom || o.book || o.label || '').trim();
  }
  return '';
}

/** Legacy imports append the page to `custom`: `Tasha's Cauldron pg. 12`. */
const PAGE_SUFFIX = /\s+pg\.\s*\d+.*$/i;

/**
 * Every name the document gives for its source, for the manager to compare
 * against the homebrew's. Neptunium's `flags.plutonium.source` is the exact
 * 5etools id (`TCE`, `LLAART`); `system.source.book` is an abbreviation, with
 * Foundry's own spelling for a few books (`TCoE`, `PHB 2024`); `custom` is
 * whatever someone typed. Empty when the document records no source.
 * @param {unknown} doc
 * @returns {string[]}
 */
export function readSourceIds(doc) {
  const ids = [getPath(doc, 'flags.plutonium.source')];
  for (const path of ['system.source', 'system.details.source']) {
    const src = getPath(doc, path);
    if (typeof src === 'string') ids.push(src);
    else if (src && typeof src === 'object') {
      const o = /** @type {Record<string, unknown>} */ (src);
      ids.push(o.book, String(o.custom ?? '').replace(PAGE_SUFFIX, ''));
    }
  }
  const out = [];
  for (const id of ids) {
    const value = typeof id === 'string' ? id.trim() : '';
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

/**
 * All three checks plus provenance, in the shape the wire protocol expects.
 *
 * @param {unknown} doc raw document data or compendium index entry
 * @returns {{ img: string, hasImage: boolean, hasDescription: boolean,
 *             descriptionChars: number, activityCount: number,
 *             activityTypes: string[], source: string, sourceIds: string[] }}
 */
export function inspectDocument(doc) {
  const img = String(getPath(doc, 'img') ?? '');
  const sourceIds = readSourceIds(doc);
  return {
    img,
    hasImage: hasRealImage(img),
    ...describeDescription(doc),
    ...describeActivities(doc),
    source: readSource(doc) || sourceIds[0] || '',
    sourceIds,
  };
}
