/**
 * Server-side render tests for FoundryReportModal and FoundryReportRow.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type { CheckResponse } from '$lib/api';
import {
  BRIDGE_FEATURES,
  type FoundryMatch,
  type ReportRow,
} from '$lib/engine/foundry/types.ts';
import FoundryReportModal from './FoundryReportModal.svelte';
import FoundryReportRow from './FoundryReportRow.svelte';

const match = (over: Partial<FoundryMatch> = {}): FoundryMatch => ({
  uuid: 'Compendium.brew.spells.Item.abc',
  name: 'Deflection',
  docType: 'spell',
  pack: 'brew.spells',
  packLabel: 'Brew Spells',
  matchKind: 'exact',
  score: 1,
  typeMatch: true,
  img: 'icons/magic/defend/shield.webp',
  hasImage: true,
  hasDescription: true,
  descriptionChars: 140,
  activityCount: 1,
  activityTypes: ['utility'],
  source: 'HB',
  sourceMatch: true,
  ...over,
});

const row = (over: Partial<ReportRow> = {}): ReportRow => ({
  candidate: {
    id: 'spell:0',
    type: 'spell',
    name: 'Deflection',
    source: 'HB',
    sourceNames: ['HB'],
    docClass: 'Item',
    expect: ['spell'],
  },
  status: 'ok',
  best: match(),
  matches: [match()],
  gaps: [],
  note: '',
  ...over,
});

const stripComments = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('FoundryReportModal', () => {
  it('renders header, summary counts, and report rows', () => {
    const report: CheckResponse = {
      file: 'Me; Spells.json',
      world: 'Eberron',
      system: 'dnd5e',
      generatedAt: 0,
      elapsedMs: 42,
      counts: { spell: 2 },
      searched: { documents: 512, packs: 3 },
      client: {
        clientId: 'c1',
        world: 'Eberron',
        worldId: 'eberron',
        user: 'GM',
        origin: 'http://localhost:30000',
        system: 'dnd5e',
        systemVersion: '4.1.0',
        foundryVersion: '12',
        moduleVersion: '1.4.0',
        connectedAt: 0,
        features: [BRIDGE_FEATURES.open],
      },
      summary: {
        total: 2,
        ok: 1,
        incomplete: 0,
        ambiguous: 0,
        missing: 1,
        noImage: 0,
        noDescription: 0,
        noActivities: 0,
      },
      rows: [
        row(),
        row({
          candidate: {
            id: 'spell:1',
            type: 'spell',
            name: 'Missing Bolt',
            source: 'HB',
            sourceNames: ['HB'],
            docClass: 'Item',
            expect: ['spell'],
          },
          status: 'missing',
          best: null,
          matches: [],
        }),
      ],
    };

    const body = stripComments(
      render(FoundryReportModal, {
        props: { report, onclose: () => {}, onopen: async () => {} },
      }).body,
    );

    expect(body).toContain('Foundry check — Me; Spells.json');
    expect(body).toContain('Eberron');
    expect(body).toContain('Showing 2 of 2');
    expect(body).toContain('Deflection');
    expect(body).toContain('Missing Bolt');
    expect(body).toContain('not in this world');
  });
});

describe('FoundryReportRow', () => {
  it('expands multi-match details and notes when open', () => {
    const second = match({
      uuid: 'Compendium.other.spells.Item.xyz',
      packLabel: 'Other Pack',
      source: 'OTHER',
      sourceMatch: false,
      matchKind: 'fuzzy',
      score: 0.85,
    });
    const r = row({
      status: 'ambiguous',
      matches: [match(), second],
      note: 'Two packs match',
    });

    const collapsed = stripComments(
      render(FoundryReportRow, {
        props: {
          row: r,
          open: false,
          statusLabel: 'Ambiguous',
          canOpen: true,
          openTitle: 'Open in Eberron',
          opening: null,
          ontoggle: () => {},
          onopen: () => {},
        },
      }).body,
    );
    expect(collapsed).toContain('+1 more');
    expect(collapsed).toContain('Two packs match');
    expect(collapsed).not.toContain('Compendium.other.spells.Item.xyz');

    const expanded = stripComments(
      render(FoundryReportRow, {
        props: {
          row: r,
          open: true,
          statusLabel: 'Ambiguous',
          canOpen: true,
          openTitle: 'Open in Eberron',
          opening: null,
          ontoggle: () => {},
          onopen: () => {},
        },
      }).body,
    );
    expect(expanded).toContain('Compendium.other.spells.Item.xyz');
    expect(expanded).toContain('fuzzy 85%');
  });
});
