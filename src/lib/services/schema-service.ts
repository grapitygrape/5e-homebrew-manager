/**
 * lib/services/schema-service.ts — schema payloads + per-type schemas.
 *
 * INTENT
 *   Load the brew schema once (large + static per process), then build either a
 *   guide's property surface (for the validator) or a ready-to-validate
 *   EntitySchema for an array key (for the parser/scan). The engine halves
 *   (buildGuideSchema, withNameSet) are pure + tested; this only supplies the
 *   loaded schemas and memoizes.
 */
import { cachedResource, getDataSource, onDataSourceReset } from './datasource';
import {
  buildGuideSchema,
  buildAllGuideSchemas,
  buildTypeSchema,
  typeLabelFor,
  withNameSet,
  BARE_SCHEMA,
} from '$lib/engine/audit';
import type {
  GuideSchema,
  TypeSchema,
  SchemaMap,
  EntitySchema,
} from '$lib/engine/audit';
import type { ArrayProp } from '$lib/engine';

const schemasCache = cachedResource<SchemaMap>(() =>
  getDataSource().getSchemas(),
);
const guideSchemaCache = new Map<string, GuideSchema | null>();
const typeSchemaCache = new Map<string, TypeSchema | null>();
const entitySchemaCache = new Map<string, EntitySchema>();
let allGuideSchemasCache: Record<string, GuideSchema | null> | null = null;
let homebrewTypesCache: { type: string; label: string }[] | null = null;

function clearDerivedSchemas(): void {
  guideSchemaCache.clear();
  typeSchemaCache.clear();
  entitySchemaCache.clear();
  allGuideSchemasCache = null;
  homebrewTypesCache = null;
}

onDataSourceReset(clearDerivedSchemas);

export function resetSchemas(): void {
  schemasCache.reset();
  clearDerivedSchemas();
}

export const getSchemasCached = (): Promise<SchemaMap> => schemasCache.get();

export async function getGuideSchema(
  guideFile: string,
): Promise<GuideSchema | null> {
  if (guideSchemaCache.has(guideFile)) {
    return guideSchemaCache.get(guideFile) ?? null;
  }
  const built = buildGuideSchema(await getSchemasCached(), guideFile);
  guideSchemaCache.set(guideFile, built);
  return built;
}

export async function getAllGuideSchemas(): Promise<
  Record<string, GuideSchema | null>
> {
  if (allGuideSchemasCache) return allGuideSchemasCache;
  allGuideSchemasCache = buildAllGuideSchemas(await getSchemasCached());
  return allGuideSchemasCache;
}

export async function getTypeSchema(
  arrayProp: string,
): Promise<TypeSchema | null> {
  if (typeSchemaCache.has(arrayProp)) {
    return typeSchemaCache.get(arrayProp) ?? null;
  }
  const built = buildTypeSchema(await getSchemasCached(), arrayProp);
  typeSchemaCache.set(arrayProp, built);
  return built;
}

const TYPE_EXCLUDE = new Set(['_meta', '_test', '$schema', 'blocklist']);

export async function listHomebrewTypes(): Promise<
  { type: string; label: string }[]
> {
  if (homebrewTypesCache) return homebrewTypesCache;
  const schemas = await getSchemasCached();
  const hbKey = Object.keys(schemas).find(
    (k) => k === 'homebrew.json' || k.endsWith('/homebrew.json'),
  );
  const props = hbKey
    ? (schemas[hbKey] as { properties?: Record<string, unknown> }).properties
    : null;
  if (!props) return [];
  homebrewTypesCache = Object.keys(props)
    .filter(
      (k) =>
        !TYPE_EXCLUDE.has(k) &&
        !k.endsWith('Fluff') &&
        !k.startsWith('foundry'),
    )
    .map((type) => ({ type, label: typeLabelFor(type) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return homebrewTypesCache;
}

/**
 * Ready-to-validate EntitySchema for any homebrew array key; falls back to
 * BARE_SCHEMA only when the brew schema does not declare the type.
 */
export async function entitySchemaForType(
  arrayProp: string,
): Promise<EntitySchema> {
  const hit = entitySchemaCache.get(arrayProp);
  if (hit) return hit;
  const ts = await getTypeSchema(arrayProp);
  const built = ts
    ? withNameSet({
        entityType: ts.entityType,
        arrayProp: ts.arrayProp as ArrayProp,
        label: ts.label,
        required: ts.required,
        properties: ts.properties,
        source: 'schema',
      })
    : BARE_SCHEMA;
  entitySchemaCache.set(arrayProp, built);
  return built;
}
