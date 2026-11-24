/**
 * engine/audit/type-schema.ts — resolve the schema for ANY homebrew array key.
 *
 * INTENT
 *   The brew root `homebrew.json` declares every homebrew array property (item,
 *   spell, monster, magicvariant, bookData, …) as `{ "$ref": "<file>#/properties/
 *   <key>" }`, pointing at an array schema whose `items` is the entity schema.
 *   This walks that chain so validation reads each type's REAL required fields —
 *   not a hardcoded `name`/`source` fallback. Pure; the data layer supplies the
 *   loaded schema map.
 *
 * WHY IT EXISTS
 *   Previously only the 14 guide-mapped types had a schema; everything else fell
 *   back to BARE_SCHEMA (required name+source), which mis-validated types like
 *   `bookData` (really requires id/source/data, not name). buildTypeSchema fixes
 *   that for all ~80 homebrew types and is what the API serves.
 */
import { resolveRef, collectTopLevelProperties } from './schema.ts';
import type { SchemaMap, RefInfo, NamedProperty } from './schema.ts';
import { GUIDE_MAP, ARRAY_PROP_TO_GUIDE } from './guide-map.ts';
import type { ArrayProp } from '../types.ts';

// Map an array key to the translate.ts renderer key (for previews). Guide types
// use their declared entityType; these cover the common non-guide item/variant kin.
const ENTITY_TYPE_OVERRIDES: Record<string, string> = {
  magicvariant: 'item',
  baseitem: 'item',
  itemGroup: 'item',
  subrace: 'race',
  disease: 'condition',
  subclass: 'class',
  classFeature: 'feat',
  subclassFeature: 'feat',
};

const LABEL_OVERRIDES: Record<string, string> = {
  magicvariant: 'Magic Variant',
  baseitem: 'Base Item',
  itemGroup: 'Item Group',
  bookData: 'Book Data',
};

/** The renderer key (translate.ts) for a homebrew array key. */
export function entityTypeFor(arrayProp: string): string {
  const guide = ARRAY_PROP_TO_GUIDE[arrayProp as ArrayProp];
  if (guide && GUIDE_MAP[guide]) return GUIDE_MAP[guide].entityType;
  return ENTITY_TYPE_OVERRIDES[arrayProp] ?? arrayProp;
}

/** A human label for a homebrew array key. */
export function typeLabelFor(arrayProp: string): string {
  const guide = ARRAY_PROP_TO_GUIDE[arrayProp as ArrayProp];
  if (guide && GUIDE_MAP[guide]) return GUIDE_MAP[guide].label;
  if (LABEL_OVERRIDES[arrayProp]) return LABEL_OVERRIDES[arrayProp];
  const spaced = arrayProp.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type AnySchema = {
  properties?: Record<string, { $ref?: string }>;
  items?: { $ref?: string };
};

/** Resolve the entity (item) schema for a homebrew array key via homebrew.json. */
export function resolveTypeItemSchema(
  schemas: SchemaMap,
  arrayProp: string,
): RefInfo | null {
  const homebrewKey = Object.keys(schemas).find(
    (k) => k === 'homebrew.json' || k.endsWith('/homebrew.json'),
  );
  const file = homebrewKey ?? 'homebrew.json';
  const homebrew = homebrewKey ? (schemas[homebrewKey] as AnySchema) : null;

  let arrayInfo: RefInfo | null = null;
  const prop = homebrew?.properties?.[arrayProp];
  if (prop) {
    arrayInfo = prop.$ref
      ? resolveRef(prop.$ref, file, schemas)
      : { schema: prop, file };
  } else {
    // Fallback: any loaded schema that declares this array property.
    for (const [f, s] of Object.entries(schemas)) {
      const p = (s as AnySchema)?.properties?.[arrayProp];
      if (p) {
        arrayInfo = p.$ref
          ? resolveRef(p.$ref, f, schemas)
          : { schema: p, file: f };
        break;
      }
    }
  }
  if (!arrayInfo?.schema) return null;

  const items = (arrayInfo.schema as AnySchema).items;
  if (!items) return null;
  return items.$ref
    ? resolveRef(items.$ref, arrayInfo.file, schemas)
    : { schema: items, file: arrayInfo.file };
}

export interface TypeSchema {
  type: string;
  entityType: string;
  arrayProp: string;
  label: string;
  required: string[];
  properties: NamedProperty[];
}

/** Build the schema/validation payload for any homebrew array key. Null if unknown. */
export function buildTypeSchema(
  schemas: SchemaMap,
  arrayProp: string,
): TypeSchema | null {
  const itemInfo = resolveTypeItemSchema(schemas, arrayProp);
  if (!itemInfo) return null;
  const { properties } = collectTopLevelProperties(itemInfo, schemas);
  const list: NamedProperty[] = Object.entries(properties)
    .map(([name, info]) => ({
      name,
      type: info.type,
      description: info.description,
      required: !!info.required,
    }))
    .sort((a, b) =>
      a.required !== b.required
        ? a.required
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
  return {
    type: arrayProp,
    entityType: entityTypeFor(arrayProp),
    arrayProp,
    label: typeLabelFor(arrayProp),
    required: list.filter((p) => p.required).map((p) => p.name),
    properties: list,
  };
}
