/**
 * engine/audit/guide-schema.ts — assemble a guide's validation/schema payload.
 *
 * INTENT
 *   Tie the three registries together into the one object the validator and the
 *   Guides view consume: for a guide file, what entity type it is, which array
 *   key it lives under, its label, and its top-level schema properties (with
 *   required flags). Pure — feed it a loaded schema map (the DataSource's job).
 *   This is the engine half of the `/api/schema-properties` endpoint.
 *
 * REUSE NOTES
 *   - The returned shape is a superset of validate.ts `EntitySchema` minus the
 *     derived `nameSet`; callers run `withNameSet()` to get a ready validator schema.
 */
import { GUIDE_MAP } from './guide-map.ts';
import { getEntityProperties } from './schema.ts';
import type { SchemaMap, NamedProperty } from './schema.ts';

export interface GuideSchema {
  guide: string;
  entityType: string;
  arrayProp: string;
  label: string;
  required: string[];
  properties: NamedProperty[];
}

/** Build the schema payload for one guide, or null if the guide/schema is unknown. */
export function buildGuideSchema(
  schemas: SchemaMap,
  guideFile: string,
): GuideSchema | null {
  const map = GUIDE_MAP[guideFile];
  if (!map) return null;
  const properties = getEntityProperties(schemas, map.schema, map.rootRef);
  if (!properties) return null;
  return {
    guide: guideFile,
    entityType: map.entityType,
    arrayProp: map.arrayProp,
    label: map.label,
    required: properties.filter((p) => p.required).map((p) => p.name),
    properties,
  };
}

/** Build payloads for every known guide (null for any that fail to resolve). */
export function buildAllGuideSchemas(
  schemas: SchemaMap,
): Record<string, GuideSchema | null> {
  const out: Record<string, GuideSchema | null> = {};
  for (const guide of Object.keys(GUIDE_MAP))
    out[guide] = buildGuideSchema(schemas, guide);
  return out;
}
