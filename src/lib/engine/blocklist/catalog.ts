/**
 * engine/blocklist/catalog.ts — which content types can be blocked, and where.
 *
 * INTENT
 *   5etools' blocklist page is driven by "every array prop in the loaded data,
 *   minus a few structural ones". This file states that set explicitly so the
 *   manager's index is predictable: an allowlist of props (with display labels)
 *   plus the rules for which data files are worth opening. Pure; no I/O.
 *
 * WHY AN ALLOWLIST
 *   A denylist would sweep in every incidental array in the corpus (`cr`,
 *   `gems`, `lifeClass`, `converterSample`, …) and present them as blockable
 *   types they are not. The props below are the ones 5etools' own
 *   BlocklistUtil loads (its `_BASIC_FILES` + monsters + spells + classes +
 *   races), minus its `_PROPS_NO_BLOCKLIST` / `_IGNORED_CATEGORIES`.
 *
 * SKIPPED DIRECTORIES
 *   `adventure/` and `book/` are ~67 MB of `adventureData`/`bookData` — props
 *   5etools explicitly ignores. The blockable `adventure` / `book` entries live
 *   in the small top-level `adventures.json` / `books.json`, so skipping those
 *   two directories costs nothing and saves the bulk of the scan.
 */

/** Blockable prop → display label, in the order the UI should list them. */
export const BLOCKLIST_PROPS: Record<string, string> = {
  monster: 'Creatures',
  spell: 'Spells',
  item: 'Items',
  itemGroup: 'Item Groups',
  baseitem: 'Base Items',
  magicvariant: 'Magic Variants',
  itemMastery: 'Item Masteries',
  class: 'Classes',
  subclass: 'Subclasses',
  classFeature: 'Class Features',
  subclassFeature: 'Subclass Features',
  race: 'Races',
  subrace: 'Subraces',
  background: 'Backgrounds',
  feat: 'Feats',
  optionalfeature: 'Optional Features',
  charoption: 'Character Creation Options',
  action: 'Actions',
  condition: 'Conditions',
  disease: 'Diseases',
  status: 'Statuses',
  deity: 'Deities',
  cult: 'Cults',
  boon: 'Boons',
  language: 'Languages',
  object: 'Objects',
  vehicle: 'Vehicles',
  vehicleUpgrade: 'Vehicle Upgrades',
  reward: 'Rewards',
  psionic: 'Psionics',
  trap: 'Traps',
  hazard: 'Hazards',
  variantrule: 'Variant Rules',
  table: 'Tables',
  tableGroup: 'Table Groups',
  recipe: 'Recipes',
  crochetPattern: 'Homecrafts',
  deck: 'Decks',
  card: 'Cards',
  facility: 'Bastion Facilities',
  legendaryGroup: 'Legendary Groups',
  skill: 'Skills',
  sense: 'Senses',
  book: 'Books',
  adventure: 'Adventures',
};

/** Ordered prop list (object key order is the display order). */
export const BLOCKLIST_PROP_ORDER: string[] = Object.keys(BLOCKLIST_PROPS);

/** Human label for a prop, falling back to the raw prop for unknown/legacy ones. */
export const propLabel = (prop: string): string =>
  prop === '*' ? 'All' : (BLOCKLIST_PROPS[prop] ?? prop);

export const isBlockableProp = (prop: string): boolean =>
  Object.hasOwn(BLOCKLIST_PROPS, prop);

/** Directories under the data root that the index never opens. */
export const SKIPPED_DATA_DIRS = new Set(['generated', 'adventure', 'book']);

/**
 * True if a data file is worth parsing for the index.
 *
 * Fluff files carry no blockable props. Foundry companion files carry *stubs*
 * that duplicate real entities — `spells/foundry.json` alone restates 295 XPHB
 * spells, `class/foundry.json` 589 class features. They must be excluded, and
 * not only for the count: `foundry.json` sorts before `spells-xphb.json`, so
 * first-wins indexing would keep the stub and discard the real record. Note the
 * bare `foundry.json` name as well as the `foundry-` prefix — matching only the
 * prefix is what let these through the first time. 5etools skips them too
 * (`UtilsBlocklist._PROP_RE_FOUNDRY`).
 */
export function isIndexableDataFile(relPath: string): boolean {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  if (!name.endsWith('.json')) return false;
  if (
    name.startsWith('fluff-') ||
    name.startsWith('foundry-') ||
    name === 'foundry.json'
  )
    return false;
  if (
    name === 'index.json' ||
    name === 'fluff-index.json' ||
    name === 'sources.json'
  )
    return false;
  const firstSeg = relPath.includes('/')
    ? relPath.slice(0, relPath.indexOf('/'))
    : '';
  return !SKIPPED_DATA_DIRS.has(firstSeg);
}

/**
 * The blocklist category the manager writes for a prop. Identity today —
 * current 5etools passes the prop itself as the category (see
 * `utils-blocklist.js` → `ExcludeUtil.isExcluded(hash, propEnt, source)`).
 * Kept as a named seam so legacy remappings stay in one place.
 */
export const categoryForProp = (prop: string): string => prop;

/**
 * Legacy category aliases seen in older blocklist files, mapped to the prop
 * they were *meant* to address. Used only to repair loaded entries.
 */
export const LEGACY_CATEGORY_ALIASES: Record<string, string[]> = {
  // An old build wrote the parent page's category for these.
  race: ['subrace'],
  feat: ['optionalfeature'],
  class: ['subclass'],
  classFeature: ['subclassFeature'],
  item: ['itemGroup', 'baseitem', 'magicvariant'],
};
