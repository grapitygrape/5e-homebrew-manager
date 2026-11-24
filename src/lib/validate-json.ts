/**
 * validate-json.ts - shared paste-to-validate and preview helpers for Guides,
 * Schema Reference, and ResolvedPanel.
 *
 * Parses pasted JSON, unwraps the schema array prop when present, runs
 * validateEntity on each object, builds HTML issue lines, and renders an entity
 * preview purely client-side via engine.translateEntity.
 */

import {
  entityTypeFor,
  validateEntity,
  VALIDATOR_SAMPLES,
  type EntitySchema,
} from '$lib/engine/audit';
import { translateEntity } from '$lib/engine/render';
import { normalizeVariantItem } from '$lib/engine';
import { errorText, escapeHtml } from '$lib/util';

export interface ValidatorLine {
  cls: 'err' | 'warn' | 'name';
  html: string;
}

export type ValidatorResult =
  | { kind: 'empty' | 'noschema' | 'none' }
  | { kind: 'badjson'; message: string }
  | {
      kind: 'done';
      count: number;
      errs: number;
      warns: number;
      lines: ValidatorLine[];
      first: unknown;
    };

export function buildValidationResult(
  input: string,
  schema: EntitySchema | null,
): ValidatorResult {
  const text = input.trim();
  if (!text) return { kind: 'empty' };
  if (!schema) return { kind: 'noschema' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { kind: 'badjson', message: errorText(e) };
  }

  const ap = schema.arrayProp;
  let entities: unknown[];
  if (Array.isArray(parsed)) entities = parsed;
  else if (
    ap &&
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as Record<string, unknown>)[ap])
  ) {
    entities = (parsed as Record<string, unknown[]>)[ap];
  } else entities = [parsed];

  if (entities.length === 0) return { kind: 'none' };

  let errs = 0;
  let warns = 0;
  const lines: ValidatorLine[] = [];
  entities.forEach((ent, i) => {
    const { errors, warnings } = validateEntity(ent, schema);
    errs += errors.length;
    warns += warnings.length;
    const name =
      ent && typeof ent === 'object' && (ent as { name?: string }).name
        ? (ent as { name: string }).name
        : `Entity ${i + 1}`;
    if (entities.length > 1 && (errors.length || warnings.length)) {
      lines.push({ cls: 'name', html: `<strong>${escapeHtml(name)}</strong>` });
    }
    errors.forEach((e) => lines.push({ cls: 'err', html: e }));
    warnings.forEach((w) => lines.push({ cls: 'warn', html: w }));
  });
  return {
    kind: 'done',
    count: entities.length,
    errs,
    warns,
    lines,
    first: entities[0],
  };
}

export function validationSummaryText(
  result: Extract<ValidatorResult, { kind: 'done' }>,
  entityLabel = 'entity',
): string {
  const noun = `${entityLabel}${result.count > 1 ? 's' : ''}`;
  if (!result.errs && !result.warns)
    return `Valid — ${result.count} ${noun} passed.`;
  if (!result.errs) {
    return `${result.count} checked — ${result.warns} warning${result.warns > 1 ? 's' : ''}, no errors.`;
  }
  return `${result.errs} error${result.errs > 1 ? 's' : ''}${
    result.warns
      ? `, ${result.warns} warning${result.warns > 1 ? 's' : ''}`
      : ''
  }.`;
}

export function sampleValidatorJson(schema: EntitySchema | null): string {
  const key = schema?.arrayProp ?? schema?.entityType ?? 'feat';
  return JSON.stringify(
    VALIDATOR_SAMPLES[key] ?? VALIDATOR_SAMPLES.feat ?? {},
    null,
    2,
  );
}

/** Render an entity to its converted display HTML purely client-side. */
export function renderEntityPreview(
  type: string,
  entity: unknown,
  entityType = entityTypeFor(type),
): string {
  let e = JSON.parse(JSON.stringify(entity));
  // Generic variants carry display fields (rarity, value, …) in `inherits`; hoist
  // them so the rendered sheet shows them.
  if (type === 'magicvariant' || type === 'variant')
    e = normalizeVariantItem(e);
  return translateEntity(e, entityType)?._display?.html ?? '';
}
