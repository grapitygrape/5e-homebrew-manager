/**
 * engine/supersession/prop-page.ts - which list page a content type lives on.
 *
 * WHY THIS EXISTS AT ALL
 *   A mapping is keyed on `page` + `hash`, so every row needs a page. 5etools'
 *   own `UrlUtil.PROP_TO_PAGE` registers exactly three props (`spell`, `item`,
 *   `baseitem`), not enough for a UI you can point at any content type. The
 *   richer mapping is `UrlUtil.PAGE_TO_PROPS`, inverted here, plus the
 *   single-prop pages 5etools never bothered to list.
 *
 * A PROP WITH NO PAGE CANNOT BE SUPERSEDED. There is nowhere to redirect to and
 * no row to hang the "Replaces X" banner on, so the UI refuses the pick rather
 * than writing a mapping that silently does nothing.
 */

/** Content type to its 5etools list page. Absent = no list page, not supersedable. */
export const PROP_TO_PAGE: Record<string, string> = {
  // UrlUtil.PAGE_TO_PROPS, inverted.
  spell: 'spells.html',
  item: 'items.html',
  itemGroup: 'items.html',
  itemMastery: 'items.html',
  baseitem: 'items.html',
  magicvariant: 'items.html',
  race: 'races.html',
  subrace: 'races.html',
  action: 'actions.html',
  background: 'backgrounds.html',
  monster: 'bestiary.html',
  class: 'classes.html',
  subclass: 'classes.html',
  classFeature: 'classes.html',
  subclassFeature: 'classes.html',
  condition: 'conditionsdiseases.html',
  disease: 'conditionsdiseases.html',
  status: 'conditionsdiseases.html',
  cult: 'cultsboons.html',
  boon: 'cultsboons.html',
  feat: 'feats.html',
  language: 'languages.html',
  object: 'objects.html',
  optionalfeature: 'optionalfeatures.html',
  reward: 'rewards.html',
  trap: 'trapshazards.html',
  hazard: 'trapshazards.html',
  variantrule: 'variantrules.html',
  // Single-prop pages 5etools resolves by convention rather than by table.
  deity: 'deities.html',
  vehicle: 'vehicles.html',
  vehicleUpgrade: 'vehicles.html',
  psionic: 'psionics.html',
  table: 'tables.html',
  tableGroup: 'tables.html',
  recipe: 'recipes.html',
  crochetPattern: 'homecrafts.html',
  deck: 'decks.html',
  card: 'decks.html',
  facility: 'bastions.html',
  charoption: 'charcreationoptions.html',
  book: 'books.html',
  adventure: 'adventures.html',
};

/** The list page for a prop, or null when it has none. */
export const propToPage = (prop: string): string | null =>
  PROP_TO_PAGE[prop] ?? null;

/** True when a prop has a list page, and so can carry a supersession. */
export const isSupersedableProp = (prop: string): boolean =>
  Object.hasOwn(PROP_TO_PAGE, prop);

/**
 * True when two props can be mapped to one another - the replacement has to
 * render on the same kind of page as the original for the redirect to land
 * somewhere useful. `item` -> `baseitem` is fine; `item` -> `monster` is not.
 */
export const arePropsCompatible = (a: string, b: string): boolean => {
  const pa = propToPage(a);
  const pb = propToPage(b);
  return pa !== null && pa === pb;
};
