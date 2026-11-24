/**
 * engine/tag-registry.ts — the single source of truth for 5etools inline
 * `{@tag ...}` enrichers that reference content by name.
 *
 * INTENT
 *   Two engine domains care about link tags and MUST agree on pipe semantics:
 *   the renderer (render/tags.ts — what to display) and the link audit
 *   (audit/link-extract.ts — what the tag points at). Before this file each
 *   kept its own list and they disagreed (condition's source slot was treated
 *   as display text by the renderer). One registry, two consumers.
 *
 * PIPE SEMANTICS
 *   Most link tags are `{@tag Name|Source|Display}` — source at slot 1,
 *   display at slot 2. A few carry extra coordinates first (subclass,
 *   classFeature, subclassFeature, deity, card, quickref); `sourceIdx`/`displayIdx` encode
 *   that per tag. Display defaults to `sourceIdx + 1` unless overridden.
 *
 * EXTEND
 *   New link enricher → add one entry here. `props` is the homebrew/official
 *   array key(s) the target lives under; leave it empty for tags whose targets
 *   we can't index (the audit then only validates the source abbreviation).
 */

export interface LinkTagDef {
  /** Array props the target may live under. Empty ⇒ name is unverifiable. */
  props: string[];
  /** Pipe index of the source abbreviation. */
  sourceIdx: number;
  /** Pipe index of custom display text (default: sourceIdx + 1). */
  displayIdx?: number;
  /** SPA route for cross-links (render as <a href="#route">). */
  route?: string;
  /** Visual treatment when there's no route (default: tagged <span>). */
  emph?: 'strong' | 'em';
  /**
   * Source 5etools assumes when the tag omits one (render.js `defaultSource`).
   * Every default is a 2014 book, which is why an unsourced tag in a 2024 brew
   * silently targets the legacy version — and why an unsourced tag can never
   * reach homebrew content.
   */
  defaultSource?: string;
  /**
   * Pipe index whose value stands in for a missing source before
   * `defaultSource` applies — the class/subclass source for (sub)class
   * features (DataUtil.class.unpackUid*Feature).
   */
  sourceFallbackIdx?: number;
}

export const LINK_TAGS: Record<string, LinkTagDef> = {
  // -- standard `{@tag Name|Source|Display}` ----------------------------------
  spell: {
    props: ['spell'],
    sourceIdx: 1,
    defaultSource: 'PHB',
    route: 'spells',
  },
  item: {
    props: ['item', 'baseitem', 'itemGroup', 'magicvariant'],
    sourceIdx: 1,
    defaultSource: 'DMG',
    route: 'items',
  },
  feat: { props: ['feat'], sourceIdx: 1, defaultSource: 'PHB', route: 'feats' },
  class: {
    props: ['class'],
    sourceIdx: 1,
    defaultSource: 'PHB',
    route: 'classes',
  },
  creature: {
    props: ['monster'],
    sourceIdx: 1,
    defaultSource: 'MM',
    route: 'creatures',
  },
  background: {
    props: ['background'],
    sourceIdx: 1,
    defaultSource: 'PHB',
    route: 'backgrounds',
  },
  race: { props: ['race'], sourceIdx: 1, defaultSource: 'PHB', route: 'races' },
  optfeature: {
    props: ['optionalfeature'],
    sourceIdx: 1,
    defaultSource: 'PHB',
  },
  condition: { props: ['condition'], sourceIdx: 1, defaultSource: 'PHB' },
  status: { props: ['status'], sourceIdx: 1, defaultSource: 'PHB' },
  disease: { props: ['disease'], sourceIdx: 1, defaultSource: 'DMG' },
  action: {
    props: ['action'],
    sourceIdx: 1,
    defaultSource: 'PHB',
    route: 'actions',
  },
  hazard: {
    props: ['hazard', 'trap'],
    sourceIdx: 1,
    defaultSource: 'DMG',
    route: 'hazards',
  },
  trap: { props: ['trap', 'hazard'], sourceIdx: 1, defaultSource: 'DMG' },
  variantrule: {
    props: ['variantrule'],
    sourceIdx: 1,
    defaultSource: 'DMG',
    route: 'variantrules',
  },
  table: { props: ['table'], sourceIdx: 1, defaultSource: 'DMG' },
  object: { props: ['object'], sourceIdx: 1, defaultSource: 'DMG' },
  vehicle: { props: ['vehicle'], sourceIdx: 1, defaultSource: 'GoS' },
  vehupgrade: { props: ['vehicleUpgrade'], sourceIdx: 1, defaultSource: 'GoS' },
  reward: { props: ['reward'], sourceIdx: 1, defaultSource: 'DMG' },
  psionic: { props: ['psionic'], sourceIdx: 1, defaultSource: 'UATMC' },
  cult: { props: ['cult'], sourceIdx: 1, defaultSource: 'MTF' },
  boon: { props: ['boon'], sourceIdx: 1, defaultSource: 'MTF' },
  charoption: { props: ['charoption'], sourceIdx: 1, defaultSource: 'MOT' },
  recipe: { props: ['recipe'], sourceIdx: 1, defaultSource: 'HF' },
  language: { props: ['language'], sourceIdx: 1, defaultSource: 'PHB' },
  itemProperty: { props: ['itemProperty'], sourceIdx: 1, defaultSource: 'PHB' },
  itemMastery: { props: ['itemMastery'], sourceIdx: 1, defaultSource: 'XPHB' },
  itemEntry: { props: ['itemEntry'], sourceIdx: 1, defaultSource: 'DMG' },
  legroup: { props: ['legendaryGroup'], sourceIdx: 1, defaultSource: 'MM' },
  skill: {
    props: ['skill'],
    sourceIdx: 1,
    defaultSource: 'PHB',
    emph: 'strong',
  },
  sense: { props: ['sense'], sourceIdx: 1, defaultSource: 'PHB', emph: 'em' },

  facility: { props: ['facility'], sourceIdx: 1, defaultSource: 'XDMG' },
  deck: { props: ['deck'], sourceIdx: 1, defaultSource: 'DMG' },
  // Homecraft novelty tags: their targets aren't homebrew arrays we index.
  crochet: { props: [], sourceIdx: 1, defaultSource: 'CaBoMP' },
  crochetFluff: { props: [], sourceIdx: 1, defaultSource: 'CaBoMP' },

  // -- fluff `{@xFluff Name|Source|Display}` ---------------------------------
  backgroundFluff: {
    props: ['backgroundFluff'],
    sourceIdx: 1,
    defaultSource: 'PHB',
  },
  classFluff: { props: ['classFluff'], sourceIdx: 1, defaultSource: 'PHB' },
  creatureFluff: { props: ['monsterFluff'], sourceIdx: 1, defaultSource: 'MM' },
  itemFluff: { props: ['itemFluff'], sourceIdx: 1, defaultSource: 'DMG' },
  raceFluff: { props: ['raceFluff'], sourceIdx: 1, defaultSource: 'PHB' },
  recipeFluff: { props: ['recipeFluff'], sourceIdx: 1, defaultSource: 'HF' },
  spellFluff: { props: ['spellFluff'], sourceIdx: 1, defaultSource: 'PHB' },

  // -- extra leading coordinates ----------------------------------------------
  // {@classFeature Name|Class|ClassSource|Level|Source|Display}
  classFeature: {
    props: ['classFeature'],
    sourceIdx: 4,
    sourceFallbackIdx: 2,
    defaultSource: 'PHB',
  },
  // {@subclassFeature Name|Class|ClassSource|ScShortName|ScSource|Level|Source|Display}
  subclassFeature: {
    props: ['subclassFeature'],
    sourceIdx: 6,
    sourceFallbackIdx: 4,
    defaultSource: 'PHB',
  },
  // {@subclass ShortName|Class|ClassSource|Source|Display}. A missing source
  // means PHB, not the class source (DataUtil.class.unpackUidSubclass).
  subclass: {
    props: ['subclass'],
    sourceIdx: 3,
    defaultSource: 'PHB',
    route: 'classes',
  },
  subclassFluff: {
    props: ['subclassFluff'],
    sourceIdx: 3,
    defaultSource: 'PHB',
  },
  // {@deity Name|Pantheon|Source|Display}
  deity: { props: ['deity'], sourceIdx: 2, defaultSource: 'PHB' },
  // {@card Name|Set|Source|Display}
  card: { props: ['card'], sourceIdx: 2, defaultSource: 'DMG' },
  // {@quickref Name|Source|Page|Version|Display} — targets aren't indexable;
  // the audit only validates the source part.
  quickref: {
    props: [],
    sourceIdx: 1,
    defaultSource: 'PHB',
    displayIdx: 4,
  },
};

/**
 * Every non-link enricher the renderer understands (formatting, dice, statblock
 * shorthands, external refs). The audit uses this to tell "known tag that isn't
 * a content link" (fine) from "unknown tag" (probably a typo → format warning).
 */
export const NON_LINK_TAGS: Set<string> = new Set([
  'b',
  'bold',
  'i',
  'italic',
  'u',
  'underline',
  's',
  'strike',
  's2',
  'strikeDouble',
  'u2',
  'underlineDouble',
  'code',
  'kbd',
  'sup',
  'sub',
  'note',
  'tip',
  'highlight',
  'color',
  'style',
  'font',
  'comic',
  'comicH1',
  'comicH2',
  'comicH3',
  'comicH4',
  'comicNote',
  'dice',
  'damage',
  'autodice',
  'scaledice',
  'scaledamage',
  'hit',
  'd20',
  'dc',
  'chance',
  'recharge',
  'coinflip',
  'ability',
  'savingThrow',
  'skillCheck',
  'atk',
  'atkr',
  'h',
  'hom',
  'm',
  'initiative',
  'hitYourSpellAttack',
  'dcYourSpellSave',
  'actSave',
  'actSaveFail',
  'actSaveFailBy',
  'actSaveSuccess',
  'actSaveSuccessOrFail',
  'actTrigger',
  'actResponse',
  'link',
  '5etools',
  '5etoolsImg',
  '5etoolsAudio',
  'help',
  'filter',
  'book',
  'adventure',
  'footnote',
  'area',
  'homebrew',
  'loader',
  'cite',
  'unit',
]);

export const isKnownTag = (tag: string): boolean =>
  tag in LINK_TAGS || NON_LINK_TAGS.has(tag);

export interface LinkTagParts {
  name: string;
  source?: string;
  display: string;
  /** The source 5etools resolves a source-less tag against. */
  effectiveDefault?: string;
}

/** Split a link tag's inner text per its registry semantics. */
export function splitLinkTag(def: LinkTagDef, inner: string): LinkTagParts {
  const parts = inner.split('|').map((p) => p.trim());
  const name = parts[0] ?? '';
  const source = parts[def.sourceIdx] || undefined;
  const display = parts[def.displayIdx ?? def.sourceIdx + 1] || name;
  const effectiveDefault =
    (def.sourceFallbackIdx != null ? parts[def.sourceFallbackIdx] : '') ||
    def.defaultSource;
  return { name, source, display, effectiveDefault };
}
