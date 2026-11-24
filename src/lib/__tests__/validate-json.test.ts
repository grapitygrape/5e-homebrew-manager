/** Tests for shared JSON validator and client-side preview helpers. */
import { describe, it, expect } from 'vitest';
import type { EntitySchema } from '../engine/audit';
import {
  buildValidationResult,
  validationSummaryText,
  sampleValidatorJson,
  renderEntityPreview,
} from '../validate-json.ts';

const featSchema = {
  entityType: 'feat',
  arrayProp: 'feat',
  label: 'Feat',
  source: 'schema',
  properties: [],
  required: ['name'],
} as EntitySchema;

describe('buildValidationResult', () => {
  it('returns empty when input is blank', () => {
    expect(buildValidationResult('', featSchema)).toEqual({ kind: 'empty' });
  });

  it('returns noschema when schema is missing', () => {
    expect(buildValidationResult('{}', null)).toEqual({ kind: 'noschema' });
  });

  it('returns badjson on invalid JSON', () => {
    const r = buildValidationResult('{', featSchema);
    expect(r.kind).toBe('badjson');
  });

  it('validates a single entity object', () => {
    const r = buildValidationResult(
      JSON.stringify({ name: 'Test' }),
      featSchema,
    );
    expect(r.kind).toBe('done');
    if (r.kind === 'done') {
      expect(r.count).toBe(1);
      expect(r.errs).toBe(0);
    }
  });

  it('unwraps the schema array prop', () => {
    const r = buildValidationResult(
      JSON.stringify({ feat: [{ name: 'A' }, { name: 'B' }] }),
      featSchema,
    );
    expect(r.kind).toBe('done');
    if (r.kind === 'done') expect(r.count).toBe(2);
  });
});

describe('validationSummaryText', () => {
  it('reports a clean pass', () => {
    expect(
      validationSummaryText(
        { kind: 'done', count: 1, errs: 0, warns: 0, lines: [], first: {} },
        'Feat',
      ),
    ).toBe('Valid — 1 Feat passed.');
  });
});

describe('sampleValidatorJson', () => {
  it('returns pretty-printed sample JSON', () => {
    const json = sampleValidatorJson(featSchema);
    expect(json.split('\n').length).toBeGreaterThan(1);
    expect(JSON.parse(json)).toBeTypeOf('object');
  });
});

describe('renderEntityPreview', () => {
  it('renders a standard entity to display HTML client-side', () => {
    const html = renderEntityPreview('feat', {
      name: 'Keen Mind',
      source: 'HB',
      entries: ['You always know which way is north.'],
    });
    expect(html).toContain('Keen Mind');
    expect(html).toContain('which way is north');
  });

  it('normalizes magicvariant inherits before rendering without mutating input', () => {
    const variant = {
      name: 'Frost Weapon',
      entries: ['Deals extra cold damage.'],
      inherits: {
        source: 'HB',
        rarity: 'rare',
      },
    };
    const html = renderEntityPreview('magicvariant', variant);
    expect(html).toContain('Frost Weapon');
    expect(html).toContain('rarity-rare');
    expect(html).toContain('<em>HB</em>');
    expect(html).toContain('extra cold damage');
    expect('rarity' in variant).toBe(false);
  });
});
