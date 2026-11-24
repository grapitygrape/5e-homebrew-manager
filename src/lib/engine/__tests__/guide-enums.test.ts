/** Tests for engine/audit/guide-enums.ts — the generated value lists in guides. */
import { describe, it, expect } from 'vitest';
import { regenerateGuideLists } from '../audit/guide-enums.ts';
import type { SchemaMap } from '../audit/schema.ts';

const schemas: SchemaMap = {
  'util.json': {
    $defs: {
      dataDamageType: { enum: ['acid', 'fire'] },
      // Followed across files, relative to this one.
      tagsConditions: { $ref: 'shared/conditions.json#/$defs/list' },
    },
  },
  'shared/conditions.json': {
    $defs: { list: { anyOf: [{ enum: ['blinded'] }, { const: 'prone' }] } },
  },
};

const span = (name: string, body: string) =>
  `<span class="schema-enum" data-enum="${name}">${body}</span>`;

describe('regenerateGuideLists', () => {
  it('leaves a current list alone', () => {
    const md = `Types: ${span('damageTypes', '<code>"acid"</code>, <code>"fire"</code>')}`;
    const out = regenerateGuideLists(md, schemas);
    expect(out).toEqual({ next: md, problems: [], total: 1, unknown: 0 });
  });

  it('rewrites a stale list and follows $refs across files', () => {
    const md = `${span('conditions', '<code>"old"</code>')}`;
    const out = regenerateGuideLists(md, schemas);
    expect(out.problems).toEqual(['stale "conditions"']);
    expect(out.next).toBe(
      span('conditions', '<code>"blinded"</code>, <code>"prone"</code>'),
    );
  });

  it('reports a list name it has no definition for, unchanged', () => {
    const md = span('nope', 'x');
    const out = regenerateGuideLists(md, schemas);
    expect(out).toMatchObject({ next: md, unknown: 1 });
    expect(out.problems).toEqual(['unknown data-enum "nope"']);
  });

  it('upgrades the legacy placeholder tag', () => {
    const out = regenerateGuideLists(
      '<schema-enum type="damageTypes">damage types</schema-enum>',
      schemas,
    );
    expect(out.problems[0]).toMatch(/^legacy/);
    expect(out.next).toBe(
      span('damageTypes', '<code>"acid"</code>, <code>"fire"</code>'),
    );
  });

  it('names a schema pointer that no longer resolves instead of throwing', () => {
    const out = regenerateGuideLists(span('damageTypes', 'x'), {});
    expect(out.problems[0]).toMatch(/damageTypes.*util\.json/);
    expect(out.next).toBe(span('damageTypes', 'x'));
  });
});
