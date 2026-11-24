/**
 * Render and filter tests for the Replace Content header, filter bar, and
 * ReplacementPage controller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from 'svelte/server';
import type { SupersessionRow } from '$lib/engine/supersession';
import { doc, markSaved, suggestions } from '$lib/state/supersessions.svelte.ts';
import {
  ReplacementPage,
  WARNINGS_FILTER,
  guessProp,
} from '$lib/state/replacement-page.svelte.ts';
import ReplacementHeader from './ReplacementHeader.svelte';
import ReplacementFilters from './ReplacementFilters.svelte';

const row = (over: Partial<SupersessionRow> = {}): SupersessionRow => ({
  prop: 'spell',
  page: 'spells.html',
  source: 'PHB',
  hash: 'shield_phb',
  displayName: 'Shield',
  replacedBy: [{ uid: 'Deflection|HB', prop: 'spell', page: 'spells.html' }],
  ...over,
});

const cleanHtml = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');

beforeEach(() => {
  doc.rows = [];
  doc.review = [];
  doc.overrides = [];
  doc.fileExists = true;
  doc.deployedExists = false;
  suggestions.list = [];
  suggestions.duplicates = null;
  suggestions.dismissed.clear();
  suggestions.dismissedDuplicates.clear();
  markSaved();
});

describe('ReplacementHeader', () => {
  it('renders counts, actions, and missing-file / dirty warnings', () => {
    doc.rows = [row()];
    doc.fileExists = false;
    const page = new ReplacementPage();
    page.loading = false;

    const body = cleanHtml(
      render(ReplacementHeader, {
        props: {
          page,
          authoringPath: '/repo/content-replacement.json',
          deployPath: '/site/content-replacement.json',
          canDeploy: true,
        },
      }).body,
    );

    expect(body).toContain('Content Replacements');
    expect(body).toContain('1 individual item');
    expect(body).toContain('no content-replacement.json yet - Save creates it');
    expect(body).toContain('unsaved changes');
    expect(body).toContain('Rescan');
    expect(body).toContain('Scan Foundry');
  });

  it('surfaces warning filter and Add all when review items or suggestions exist', () => {
    doc.review = [
      { replacement: 'Deflection|HB', targets: ['Shield|PHB'], reason: 'note' },
    ];
    suggestions.list = [
      {
        row: row(),
        missing: [{ uid: 'Deflection|HB', prop: 'spell', page: 'spells.html' }],
      },
    ];
    markSaved();
    const page = new ReplacementPage();
    page.loading = false;

    const body = cleanHtml(
      render(ReplacementHeader, {
        props: {
          page,
          authoringPath: '/repo/content-replacement.json',
          deployPath: null,
          canDeploy: false,
        },
      }).body,
    );

    expect(body).toContain('1 to review');
    expect(body).toContain('Add all 1');
  });
});

describe('ReplacementFilters', () => {
  it('lists active categories and warning option when warnings exist', () => {
    doc.rows = [
      row(),
      row({
        prop: 'item',
        page: 'items.html',
        hash: 'bag_dmg',
        displayName: 'Bag of Holding',
        source: 'DMG',
        replacedBy: [{ uid: 'Pack of Holding|HB', prop: 'item', page: 'items.html' }],
      }),
    ];
    doc.review = [
      { replacement: 'Deflection|HB', targets: ['Shield|PHB'], reason: 'note' },
    ];
    markSaved();
    const page = new ReplacementPage();

    const body = cleanHtml(
      render(ReplacementFilters, { props: { page } }).body,
    );

    expect(body).toContain('Swap view');
    expect(body).toContain('Add a replacement');
    expect(body).toContain(`value="${WARNINGS_FILTER}"`);
    expect(body).toContain('Warnings (1)');
    expect(body).toContain('Spells (1)');
    expect(body).toContain('Items (1)');
  });
});

describe('ReplacementPage filtering and helpers', () => {
  it('filters rows by query, type, and warnings mode', () => {
    doc.rows = [
      row(),
      row({
        prop: 'item',
        page: 'items.html',
        hash: 'bag_dmg',
        displayName: 'Bag of Holding',
        source: 'DMG',
        replacedBy: [{ uid: 'Pack of Holding|HB', prop: 'item', page: 'items.html' }],
      }),
    ];
    doc.review = [
      { replacement: 'Deflection|HB', targets: ['Shield|PHB'], reason: 'note' },
    ];
    markSaved();
    const page = new ReplacementPage();

    expect(page.filteredRows).toHaveLength(2);
    page.category = 'item';
    expect(page.filteredRows.map((r) => r.displayName)).toEqual([
      'Bag of Holding',
    ]);
    expect(page.visibleReview).toEqual([]);

    page.category = WARNINGS_FILTER;
    expect(page.filteredRows).toEqual([]);
    expect(page.visibleReview).toHaveLength(1);

    page.category = '';
    page.listQuery = 'deflection';
    expect(page.filteredRows.map((r) => r.displayName)).toEqual(['Shield']);
  });

  it('guesses prop from existing rows and falls back to spell', () => {
    const rows = [
      row({
        prop: 'feat',
        page: 'feats.html',
        replacedBy: [{ uid: 'Tougher|HB', prop: 'feat', page: 'feats.html' }],
      }),
    ];
    expect(guessProp(rows, 'Tougher|HB')).toBe('feat');
    expect(guessProp(rows, 'Unknown|HB')).toBe('spell');
  });
});
