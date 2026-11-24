/**
 * lib/schema-validator-client.ts — the Parser's full-schema validator, built
 * once per session from the brew schema folder.
 *
 * Building compiles every schema (a second or two), so it's shared and kept.
 * A failure isn't kept: the next caller tries again, so fixing the folder in
 * Settings takes effect without a restart. Callers fall back to the property
 * checks in engine/audit/validate.ts while `ok` is false.
 */
import { getSchemaMap } from '$lib/api';
import { createSchemaValidator, type SchemaValidator } from '$lib/engine/audit';

export type SchemaValidatorState =
  { ok: true; validator: SchemaValidator } | { ok: false; reason: string };

let pending: Promise<SchemaValidatorState> | null = null;

export function loadSchemaValidator(): Promise<SchemaValidatorState> {
  pending ??= build().then((state) => {
    if (!state.ok) pending = null;
    return state;
  });
  return pending;
}

async function build(): Promise<SchemaValidatorState> {
  try {
    const map = await getSchemaMap();
    if (!Object.keys(map).length)
      return {
        ok: false,
        reason:
          'no brew schemas found. Set the Brew schema folder (5etools-utils schema/brew) in Settings',
      };
    return { ok: true, validator: createSchemaValidator(map) };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
