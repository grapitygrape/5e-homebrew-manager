/**
 * engine/audit/validate.ts — lightweight entity validation against a guide's schema.
 *
 * INTENT
 *   Cheap structural checks the parser/validator run on every pasted entity:
 *   required-field presence, unknown top-level keys, and a couple of shape
 *   sanity checks. NOT full JSON-Schema validation (that's schema-validate.ts);
 *   this is the fast, friendly first pass.
 *
 * REUSE NOTES
 *   - Messages embed `<code>` on purpose (the UI renders them as HTML).
 *   - `EntitySchema` is what the schema endpoint / fallback produces; `nameSet`
 *     is derived once via `withNameSet` so unknown-key checks are O(1).
 *   - SAMPLES / TYPE_RELATIONSHIPS / BARE_SCHEMA live here so the parser and the
 *     validator share one definition.
 */
import type { Entity, ValidationResult, ArrayProp } from '../types.ts';
import { escapeHtml } from '../../util.ts';

export interface SchemaProperty {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface EntitySchema {
  guide?: string;
  entityType: string;
  arrayProp: ArrayProp | null;
  label: string;
  required: string[];
  properties: SchemaProperty[];
  /** Set of property names; build with `withNameSet`. Absent ⇒ skip unknown-key check. */
  nameSet?: Set<string>;
  source?: 'schema' | 'guide' | 'minimal';
}

/** Attach a `nameSet` derived from `properties` (idempotent). */
export function withNameSet(schema: EntitySchema): EntitySchema {
  schema.nameSet = new Set(schema.properties.map((p) => p.name));
  return schema;
}

/** Validate one entity against `schema`. Returns HTML-bearing error/warning lists. */
export function validateEntity(
  entity: unknown,
  schema: EntitySchema,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entity === null || typeof entity !== 'object' || Array.isArray(entity)) {
    errors.push('Entity must be a JSON object.');
    return { errors, warnings };
  }
  const obj = entity as Record<string, unknown>;

  // 5etools generic variants supply fields via `inherits` — a required field
  // present there (e.g. `rarity`) satisfies the requirement.
  const inherits =
    obj.inherits &&
    typeof obj.inherits === 'object' &&
    !Array.isArray(obj.inherits)
      ? (obj.inherits as Record<string, unknown>)
      : null;
  const isPresent = (v: unknown): boolean =>
    !(
      v === undefined ||
      v === null ||
      (Array.isArray(v) && v.length === 0) ||
      v === ''
    );

  // A `_copy` entity gets everything else from the entity it copies, so the
  // brew schema only asks for its own identity.
  const isCopy =
    !!obj._copy && typeof obj._copy === 'object' && !Array.isArray(obj._copy);
  for (const req of schema.required || []) {
    if (isCopy && req !== 'name' && req !== 'source') continue;
    if (!isPresent(obj[req]) && !(inherits && isPresent(inherits[req]))) {
      errors.push(`Missing required property <code>${escapeHtml(req)}</code>.`);
    }
  }

  if (schema.nameSet && schema.nameSet.size > 0) {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('_') || key === '$schema') continue;
      if (!schema.nameSet.has(key)) {
        warnings.push(
          `Unknown property <code>${escapeHtml(key)}</code> — not in the ${escapeHtml(schema.label || 'entity')} schema.`,
        );
      }
    }
  }

  if (obj.entries !== undefined && !Array.isArray(obj.entries))
    errors.push('<code>entries</code> must be an array.');
  if (obj.source !== undefined && typeof obj.source !== 'string')
    errors.push('<code>source</code> must be a string.');

  return { errors, warnings };
}

/** Minimal schema for entity types that have no conversion guide (monster, vehicle, …). */
export const BARE_SCHEMA: EntitySchema = {
  entityType: 'object',
  arrayProp: null,
  label: 'Object',
  required: ['name', 'source'],
  properties: [],
  nameSet: undefined, // skip unknown-prop check
  source: 'minimal',
};

/** Parent→child relationships between top-level homebrew arrays (for the parser outline). */
export interface TypeRelationship {
  childType: ArrayProp;
  parentType: ArrayProp;
  matchFn: (child: Entity, parent: Entity) => boolean;
}

/** magicvariant -> base item: the variant's `inherits` block names its base (name [+ source]). */
function matchInheritsBase(child: Entity, parent: Entity): boolean {
  const inh = child.inherits;
  if (!inh || typeof inh !== 'object') return false;
  const i = inh as { name?: unknown; source?: unknown };
  return i.name === parent.name && (!i.source || i.source === parent.source);
}

export const TYPE_RELATIONSHIPS: TypeRelationship[] = [
  {
    childType: 'classFeature',
    parentType: 'class',
    matchFn: (c, p) =>
      c.className === p.name && (!c.classSource || c.classSource === p.source),
  },
  {
    childType: 'subclass',
    parentType: 'class',
    matchFn: (c, p) =>
      c.className === p.name && (!c.classSource || c.classSource === p.source),
  },
  {
    childType: 'subclassFeature',
    parentType: 'subclass',
    matchFn: (c, p) =>
      c.subclassShortName === p.shortName &&
      c.className === p.className &&
      (!c.subclassSource || c.subclassSource === p.source),
  },
  {
    childType: 'subrace',
    parentType: 'race',
    matchFn: (c, p) =>
      c.raceName === p.name && (!c.raceSource || c.raceSource === p.source),
  },
  // A generic/magic variant names its base item in `inherits`; nest it under that base when
  // the base is present in the same file. Base items are often official (absent) and
  // requires/excludes-only variants have no named base — both cases simply stay top-level.
  {
    childType: 'magicvariant',
    parentType: 'baseitem',
    matchFn: matchInheritsBase,
  },
  { childType: 'magicvariant', parentType: 'item', matchFn: matchInheritsBase },
];

/** Minimal valid examples per array key, for the validator's "Insert example" button. */
export const VALIDATOR_SAMPLES: Record<string, Entity> = {
  feat: {
    name: 'Example Feat',
    source: 'MyBrew',
    page: 1,
    prerequisite: [{ level: 4 }],
    ability: [{ str: 1 }],
    entries: ['You gain a benefit described here.'],
  },
  item: {
    name: 'Example Trinket',
    source: 'MyBrew',
    type: 'G',
    rarity: 'none',
    value: 500,
    weight: 1,
    entries: ['A simple mundane trinket.'],
  },
  spell: {
    name: 'Example Bolt',
    source: 'MyBrew',
    level: 1,
    school: 'V',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 60 } },
    components: { v: true, s: true },
    duration: [{ type: 'instant' }],
    entries: ['A bolt of energy strikes a target you can see.'],
  },
  background: {
    name: 'Example Background',
    source: 'MyBrew',
    skillProficiencies: [{ insight: true, persuasion: true }],
    entries: [
      {
        type: 'list',
        style: 'list-hang-notitle',
        items: [
          {
            type: 'item',
            name: 'Skill Proficiencies',
            entry: '{@skill Insight}, {@skill Persuasion}',
          },
        ],
      },
    ],
  },
  race: {
    name: 'Example Ancestry',
    source: 'MyBrew',
    size: ['M'],
    speed: 30,
    entries: [{ type: 'entries', name: 'Trait', entries: ['A racial trait.'] }],
  },
  optionalfeature: {
    name: 'Example Invocation',
    source: 'MyBrew',
    featureType: ['EI'],
    entries: ['An eldritch invocation effect.'],
  },
  action: {
    name: 'Example Action',
    source: 'MyBrew',
    time: [{ number: 1, unit: 'action' }],
    entries: ['You take a special action.'],
  },
  condition: {
    name: 'Example Condition',
    source: 'MyBrew',
    entries: ['While affected, the creature suffers an effect.'],
  },
  class: {
    name: 'Example Class',
    source: 'MyBrew',
    hd: { number: 1, faces: 8 },
    proficiency: ['str', 'con'],
    entries: [],
  },
  subclass: {
    name: 'Example Subclass',
    shortName: 'Example',
    source: 'MyBrew',
    className: 'Fighter',
    classSource: 'PHB',
    subclassFeatures: [],
  },
  classFeature: {
    name: 'Example Feature',
    source: 'MyBrew',
    className: 'Fighter',
    classSource: 'PHB',
    level: 1,
    entries: ['A class feature gained at level 1.'],
  },
  subclassFeature: {
    name: 'Example Subclass Feature',
    source: 'MyBrew',
    className: 'Fighter',
    classSource: 'PHB',
    subclassShortName: 'Example',
    subclassSource: 'MyBrew',
    level: 3,
    entries: ['A subclass feature.'],
  },
};
