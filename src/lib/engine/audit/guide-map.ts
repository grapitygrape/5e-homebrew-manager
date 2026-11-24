/**
 * engine/audit/guide-map.ts — the registry of documents in the guides folder.
 *
 * Two kinds. GUIDE_MAP links each *conversion guide* to its 5etools schema
 * definition and runtime entity type. DOC_MAP (below) covers the rest: reference
 * documentation with no entity schema, shown as a separate "Documentation" group.
 *
 * INTENT
 *   One place to declare a guide. Shared by audit (coverage), the schema-property
 *   endpoint, the validator, and the parser's per-type schema lookups. Add a new
 *   guide here and every consumer picks it up. Ported from guide-map.js.
 *
 * FIELDS
 *   schema      schema file under the brew schema root, relative
 *   rootRef     JSON-pointer to the entity definition within that file
 *   entityType  the renderer key understood by translate.ts
 *   arrayProp   the array key this entity lives under in a homebrew file
 *   label       human-friendly singular name
 *   parentGuide optional master guide whose documented props count toward this
 *               guide's coverage (e.g. weapon/tool inherit from item)
 *   related     other definitions the guide documents with their own prop cards
 *               (a companion array, or nested shapes). Their keys aren't stale,
 *               and the audit fails if one stops resolving. Not scored.
 */
import type { ArrayProp } from '../types.ts';

export interface GuideSchemaRef {
  schema: string;
  rootRef: string;
}

export interface GuideMapEntry extends GuideSchemaRef {
  entityType: string;
  arrayProp: ArrayProp;
  label: string;
  parentGuide?: string;
  related?: GuideSchemaRef[];
}

export const GUIDE_MAP: Record<string, GuideMapEntry> = {
  'item-conversion.md': {
    schema: 'items.json',
    rootRef: '#/$defs/item',
    entityType: 'item',
    arrayProp: 'item',
    label: 'Item',
  },
  'weapon-conversion.md': {
    schema: 'items.json',
    rootRef: '#/$defs/item',
    entityType: 'item',
    arrayProp: 'item',
    label: 'Weapon',
    parentGuide: 'item-conversion.md',
  },
  'tool-conversion.md': {
    schema: 'items.json',
    rootRef: '#/$defs/item',
    entityType: 'item',
    arrayProp: 'item',
    label: 'Tool',
    parentGuide: 'item-conversion.md',
  },
  'baseitem-conversion.md': {
    schema: 'items-base.json',
    rootRef: '#/properties/baseitem/items',
    entityType: 'item',
    arrayProp: 'baseitem',
    label: 'Base Item',
    parentGuide: 'item-conversion.md',
  },
  'magicvariant-conversion.md': {
    schema: 'magicvariants.json',
    rootRef: '#/properties/magicvariant/items',
    entityType: 'item',
    arrayProp: 'magicvariant',
    label: 'Magic Variant',
    parentGuide: 'item-conversion.md',
  },
  'itemgroup-conversion.md': {
    schema: 'items.json',
    rootRef: '#/properties/itemGroup/items',
    entityType: 'item',
    arrayProp: 'itemGroup',
    label: 'Item Group',
    parentGuide: 'item-conversion.md',
  },
  'monster-conversion.md': {
    schema: 'bestiary/bestiary.json',
    rootRef: '#/properties/monster/items',
    entityType: 'monster',
    arrayProp: 'monster',
    label: 'Monster',
  },
  'legendarygroup-conversion.md': {
    schema: 'bestiary/legendarygroups.json',
    rootRef: '#/properties/legendaryGroup/items',
    entityType: 'legendaryGroup',
    arrayProp: 'legendaryGroup',
    label: 'Legendary Group',
  },
  // `vehicles.json#/$defs/vehicle` is a 6-branch oneOf; the `vehicleCreature` and
  // `vehicleObject` branches inherit the bestiary statblock surface, so the monster
  // guide legitimately documents part of vehicle's properties — same relationship as
  // weapon/tool → item. See the branch-aware coverage report (auditGuideBranched).
  'vehicle-conversion.md': {
    schema: 'vehicles.json',
    rootRef: '#/properties/vehicle/items',
    entityType: 'vehicle',
    arrayProp: 'vehicle',
    label: 'Vehicle',
    parentGuide: 'monster-conversion.md',
  },
  'vehicleupgrade-conversion.md': {
    schema: 'vehicles.json',
    rootRef: '#/properties/vehicleUpgrade/items',
    entityType: 'vehicleUpgrade',
    arrayProp: 'vehicleUpgrade',
    label: 'Vehicle Upgrade',
  },
  'trap-conversion.md': {
    schema: 'trapshazards.json',
    rootRef: '#/properties/trap/items',
    entityType: 'trap',
    arrayProp: 'trap',
    label: 'Trap',
  },
  'hazard-conversion.md': {
    schema: 'trapshazards.json',
    rootRef: '#/properties/hazard/items',
    entityType: 'hazard',
    arrayProp: 'hazard',
    label: 'Hazard',
  },
  'deity-conversion.md': {
    schema: 'deities.json',
    rootRef: '#/properties/deity/items',
    entityType: 'deity',
    arrayProp: 'deity',
    label: 'Deity',
  },
  'table-conversion.md': {
    schema: 'tables.json',
    rootRef: '#/properties/table/items',
    entityType: 'table',
    arrayProp: 'table',
    label: 'Table',
  },
  'variantrule-conversion.md': {
    schema: 'variantrules.json',
    rootRef: '#/properties/variantrule/items',
    entityType: 'variantrule',
    arrayProp: 'variantrule',
    label: 'Variant Rule',
  },
  'monsterfeatures-conversion.md': {
    schema: 'monsterfeatures.json',
    rootRef: '#/properties/monsterfeatures/items',
    entityType: 'monsterfeatures',
    arrayProp: 'monsterfeatures',
    label: 'Monster Feature',
  },
  'itemfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'itemFluff',
    arrayProp: 'itemFluff',
    label: 'Item Fluff',
  },
  'monsterfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'monsterFluff',
    arrayProp: 'monsterFluff',
    label: 'Monster Fluff',
  },
  'classfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'classFluff',
    arrayProp: 'classFluff',
    label: 'Class Fluff',
  },
  'subclassfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'subclassFluff',
    arrayProp: 'subclassFluff',
    label: 'Subclass Fluff',
  },
  'featfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'featFluff',
    arrayProp: 'featFluff',
    label: 'Feat Fluff',
  },
  'spellfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'spellFluff',
    arrayProp: 'spellFluff',
    label: 'Spell Fluff',
  },
  'backgroundfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'backgroundFluff',
    arrayProp: 'backgroundFluff',
    label: 'Background Fluff',
  },
  'conditionfluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'conditionFluff',
    arrayProp: 'conditionFluff',
    label: 'Condition Fluff',
  },
  'racefluff-conversion.md': {
    schema: 'util.json',
    rootRef: '#/$defs/genericFluffArray/items',
    entityType: 'raceFluff',
    arrayProp: 'raceFluff',
    label: 'Ancestry Fluff',
  },
  'feat-conversion.md': {
    schema: 'feats.json',
    rootRef: '#/$defs/feat',
    entityType: 'feat',
    arrayProp: 'feat',
    label: 'Feat',
  },
  'spell-conversion.md': {
    schema: 'spells/spells.json',
    rootRef: '#/$defs/spell',
    entityType: 'spell',
    arrayProp: 'spell',
    label: 'Spell',
  },
  'background-conversion.md': {
    schema: 'backgrounds.json',
    rootRef: '#/$defs/background',
    entityType: 'background',
    arrayProp: 'background',
    label: 'Background',
  },
  'ancestry-conversion.md': {
    schema: 'races.json',
    rootRef: '#/$defs/race',
    entityType: 'race',
    arrayProp: 'race',
    label: 'Ancestry',
  },
  'condition-conversion.md': {
    schema: 'conditionsdiseases.json',
    rootRef: '#/$defs/condition',
    entityType: 'condition',
    arrayProp: 'condition',
    label: 'Condition',
  },
  'optionalfeature-conversion.md': {
    schema: 'optionalfeatures.json',
    rootRef: '#/$defs/optionalfeature',
    entityType: 'optionalfeature',
    arrayProp: 'optionalfeature',
    label: 'Optional Feature',
  },
  'action-conversion.md': {
    schema: 'actions.json',
    rootRef: '#/$defs/action',
    entityType: 'action',
    arrayProp: 'action',
    label: 'Action',
  },
  'class-conversion.md': {
    schema: 'class/class.json',
    rootRef: '#/$defs/class',
    entityType: 'class',
    arrayProp: 'class',
    label: 'Class',
  },
  'subclass-conversion.md': {
    schema: 'class/class.json',
    rootRef: '#/$defs/subclass',
    entityType: 'class',
    arrayProp: 'subclass',
    label: 'Subclass',
  },
  'classfeature-conversion.md': {
    schema: 'class/class.json',
    rootRef: '#/$defs/classFeature',
    entityType: 'feat',
    arrayProp: 'classFeature',
    label: 'Class Feature',
  },
  'subclassfeature-conversion.md': {
    schema: 'class/class.json',
    rootRef: '#/$defs/subclassFeature',
    entityType: 'feat',
    arrayProp: 'subclassFeature',
    label: 'Subclass Feature',
  },
  'book-conversion.md': {
    schema: 'books.json',
    rootRef: '#/properties/book/items',
    entityType: 'book',
    arrayProp: 'book',
    label: 'Book',
  },
  'bookdata-conversion.md': {
    schema: 'corpus-shared.json',
    rootRef: '#/$defs/wrappedAdventureBookDataArray/items',
    entityType: 'bookData',
    arrayProp: 'bookData',
    label: 'Book Data',
  },
  'adventure-conversion.md': {
    schema: 'adventures.json',
    rootRef: '#/properties/adventure/items',
    entityType: 'adventure',
    arrayProp: 'adventure',
    label: 'Adventure',
  },
  'reward-conversion.md': {
    schema: 'rewards.json',
    rootRef: '#/$defs/reward',
    entityType: 'reward',
    arrayProp: 'reward',
    label: 'Reward',
  },
  'deck-conversion.md': {
    schema: 'decks.json',
    rootRef: '#/$defs/deck',
    entityType: 'deck',
    arrayProp: 'deck',
    label: 'Deck',
    related: [
      { schema: 'decks.json', rootRef: '#/$defs/card' },
      { schema: 'decks.json', rootRef: '#/$defs/_deckSpread' },
      { schema: 'decks.json', rootRef: '#/$defs/_deckSpreadPosition' },
    ],
  },
};

/**
 * DOC_MAP — the other kind of document in the guides folder: reference material
 * that isn't a per-entity conversion guide (no schema, no entity type, so no
 * validator). Listed under "Documentation" in the UI, separate from "Guides".
 *
 * `hidden` keeps a file out of the UI without deleting it (working notes,
 * scratch copies). Files in neither map still appear under Documentation, so a
 * new doc shows up without a code change — register it here only to give it a
 * nicer label or to hide it.
 */
export interface DocMapEntry {
  label: string;
  hidden?: boolean;
}

export const DOC_MAP: Record<string, DocMapEntry> = {
  'item-properties-reference.md': { label: 'Item Properties Reference' },
  'prerequisite-reference.md': { label: 'Prerequisite Reference' },
  'additionalspells-reference.md': { label: 'Additional Spells Reference' },
  'meta.md': { label: 'Meta', hidden: true },
  'Spec_Copy.md': { label: 'Spec Copy', hidden: true },
};

/** Which section a guides-folder file belongs to; null when it should be hidden. */
export function docGroupFor(file: string): 'guide' | 'doc' | null {
  if (file in GUIDE_MAP) return 'guide';
  return DOC_MAP[file]?.hidden ? null : 'doc';
}

/**
 * Conversion guides with no GUIDE_MAP entry. These never get audited, which is
 * how a schema rename can go stale unnoticed, so the audit fails on any.
 */
export function unmappedGuides(files: Iterable<string>): string[] {
  return [...files]
    .filter(
      (f) =>
        f.endsWith('-conversion.md') && !(f in GUIDE_MAP) && !(f in DOC_MAP),
    )
    .sort();
}

/** arrayProp → guide file (first guide that owns each array key). */
export const ARRAY_PROP_TO_GUIDE: Partial<Record<ArrayProp, string>> = (() => {
  const out: Partial<Record<ArrayProp, string>> = {};
  for (const [guide, v] of Object.entries(GUIDE_MAP))
    if (!(v.arrayProp in out)) out[v.arrayProp] = guide;
  return out;
})();
