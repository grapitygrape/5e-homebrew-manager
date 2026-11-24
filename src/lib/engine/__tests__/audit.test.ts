/** Tests for engine/audit.ts — guide key extraction + coverage scoring. */
import { describe, it, expect } from 'vitest';
import {
  extractGuideKeys,
  auditGuide,
  auditGuideBranched,
  aggregateAudit,
  type AuditSummaryRow,
} from '../audit/audit.ts';
import fs from 'node:fs';
import path from 'node:path';
import { getRelatedKeys, type NamedProperty } from '../audit/schema.ts';
import { unmappedGuides } from '../audit/guide-map.ts';

const schemaProps: NamedProperty[] = [
  { name: 'name', type: 'string', description: '', required: true },
  { name: 'value', type: 'integer', description: '', required: false },
  { name: 'rarity', type: 'string', description: '', required: false },
];

const guide = `
<div class="prop-card-key"><code>name</code></div>
<table><tbody><tr><td><code>value</code></td><td>Cost</td></tr></tbody></table>
<div class="prop-card-key"><code>foobar</code></div>
`;

describe('extractGuideKeys', () => {
  it('reads prop-card-key and property-table names only', () => {
    expect([...extractGuideKeys(guide)].sort()).toEqual([
      'foobar',
      'name',
      'value',
    ]);
  });
});

describe('auditGuide', () => {
  it('scores coverage and flags undocumented + guide-only keys', () => {
    const r = auditGuide({
      guideContent: guide,
      schemaProperties: schemaProps,
    });
    expect(r.coverage).toBe(67); // name + value documented of 3
    expect(r.undocumentedProperties.map((p) => p.name)).toEqual(['rarity']);
    expect(r.guideOnlyProperties).toEqual(['foobar']);
    expect(r.requiredProperties).toEqual(['name']);
  });

  it('credits a parent guide toward coverage', () => {
    const parent = `<div class="prop-card-key"><code>rarity</code></div>`;
    const r = auditGuide({
      guideContent: guide,
      parentContent: parent,
      schemaProperties: schemaProps,
    });
    expect(r.coverage).toBe(100);
  });

  it("doesn't flag keys of related definitions as guide-only", () => {
    const r = auditGuide({
      guideContent: guide,
      schemaProperties: schemaProps,
      relatedKeys: ['foobar'],
    });
    expect(r.guideOnlyProperties).toEqual([]);
    expect(r.coverage).toBe(67); // related keys aren't scored
  });
});

describe('getRelatedKeys', () => {
  const schemas = {
    'decks.json': {
      $defs: {
        card: { properties: { name: {}, suit: {} } },
      },
    },
  };

  it('collects related property names and reports refs that no longer resolve', () => {
    const r = getRelatedKeys(schemas, [
      { schema: 'decks.json', rootRef: '#/$defs/card' },
      { schema: 'decks.json', rootRef: '#/$defs/_deckSpread' },
    ]);
    expect([...r.keys].sort()).toEqual(['name', 'suit']);
    expect(r.unresolved).toEqual(['decks.json#/$defs/_deckSpread']);
  });
});

describe('unmappedGuides', () => {
  it('lists conversion guides missing from GUIDE_MAP, ignoring docs', () => {
    expect(
      unmappedGuides([
        'item-conversion.md',
        'widget-conversion.md',
        'Spec_Copy.md',
        'meta.md',
      ]),
    ).toEqual(['widget-conversion.md']);
  });

  it('maps every conversion guide in the repo', () => {
    const dir = path.resolve(import.meta.dirname, '../../../../guides');
    expect(unmappedGuides(fs.readdirSync(dir))).toEqual([]);
  });
});

describe('aggregateAudit', () => {
  it('rolls per-guide rows into headline coverage', () => {
    const summary: AuditSummaryRow[] = [
      { guide: 'a.md', coverage: 50, total: 10, missing: 5, extra: 1 },
      { guide: 'b.md', coverage: 90, total: 10, missing: 1, extra: 0 },
    ];
    const agg = aggregateAudit(summary);
    expect(agg.guides).toBe(2);
    expect(agg.totalFields).toBe(20);
    expect(agg.documented).toBe(14); // 20 - 6 missing
    expect(agg.missing).toBe(6);
    expect(agg.extra).toBe(1);
    expect(agg.coverage).toBe(70); // round(14/20)
  });

  it('reports 100% coverage for an empty summary', () => {
    expect(aggregateAudit([]).coverage).toBe(100);
  });
});

describe('auditGuideBranched', () => {
  const shipProps: NamedProperty[] = [
    { name: 'name', type: 'string', description: '', required: true },
    { name: 'hull', type: 'integer', description: '', required: false },
  ];
  const creatureProps: NamedProperty[] = [
    { name: 'name', type: 'string', description: '', required: true },
    { name: 'cr', type: 'string', description: '', required: false },
    { name: 'speed', type: 'object', description: '', required: false },
  ];
  const branches = [
    { name: 'ship', schemaProperties: shipProps },
    { name: 'creature', schemaProperties: creatureProps },
  ];
  // Documents the ship shape fully, the creature shape only partially.
  const partial = `
<div class="prop-card-key"><code>name</code></div>
<div class="prop-card-key"><code>hull</code></div>
`;

  it('scores each branch separately rather than against the union', () => {
    const r = auditGuideBranched({ guideContent: partial, branches });
    expect(r.branches.map((b) => b.branch)).toEqual(['ship', 'creature']);
    expect(r.branches[0].coverage).toBe(100);
    expect(r.branches[1].coverage).toBe(33); // name of 3
    expect(r.branches[1].undocumentedProperties.map((p) => p.name)).toEqual([
      'cr',
      'speed',
    ]);
  });

  it('headlines the WORST branch, so a strong branch cannot hide a weak one', () => {
    const r = auditGuideBranched({ guideContent: partial, branches });
    expect(r.coverage).toBe(33);
    expect(r.worstBranch).toBe('creature');
  });

  it('counts parentGuide keys toward every branch', () => {
    const r = auditGuideBranched({
      guideContent: partial,
      parentContent:
        '<div class="prop-card-key"><code>cr</code></div><div class="prop-card-key"><code>speed</code></div>',
      branches,
    });
    expect(r.coverage).toBe(100);
  });

  it('reports 100% when given no branches', () => {
    const r = auditGuideBranched({ guideContent: partial, branches: [] });
    expect(r.coverage).toBe(100);
    expect(r.branches).toEqual([]);
  });
});
