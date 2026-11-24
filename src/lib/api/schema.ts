import { getJson, rpc } from './transport';
import * as schemaService from '$lib/services/schema-service';
import {
  withNameSet,
  type EntitySchema,
  type GuideSchema,
  type SchemaMap,
  type TypeSchema,
} from '$lib/engine/audit';
import type { ArrayProp } from '$lib/engine';

export interface SchemaTypeListing {
  type: string;
  label: string;
}

const jsonOrNull = <T>(url: string): Promise<T | null> =>
  getJson<T>(url).catch(() => null);

export function toEntitySchema(
  payload: GuideSchema | TypeSchema,
): EntitySchema {
  return withNameSet({
    ...payload,
    arrayProp: payload.arrayProp as ArrayProp,
    source: 'schema',
  });
}

export const getGuideSchema = (file: string): Promise<GuideSchema | null> =>
  rpc(
    () => schemaService.getGuideSchema(file).catch(() => null),
    () =>
      jsonOrNull(`/api/schema-properties?guide=${encodeURIComponent(file)}`),
  );

export const getTypeSchema = (type: string): Promise<TypeSchema | null> =>
  rpc(
    () => schemaService.getTypeSchema(type).catch(() => null),
    () => jsonOrNull(`/api/schema/types/${encodeURIComponent(type)}`),
  );

export const getSchemaMap = (): Promise<SchemaMap> =>
  rpc(
    () => schemaService.getSchemasCached().catch(() => ({})),
    async () => (await jsonOrNull<SchemaMap>('/api/schema/map')) ?? {},
  );

export const listSchemaTypes = (): Promise<SchemaTypeListing[]> =>
  rpc(schemaService.listHomebrewTypes, () =>
    getJson<SchemaTypeListing[]>('/api/schema/types'),
  );
