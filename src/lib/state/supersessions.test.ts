/**
 * The store's contract, from OUTSIDE the module - which is the only place the
 * question is interesting. A module-level `let x = $state()` cannot be
 * reassigned by an importer, so the exports are accessor objects; these tests
 * are what proves that indirection actually works, because the failure mode is
 * a page that reads a stale value rather than an error anyone would notice.
 *
 * No I/O: `loadDocument` and `saveDocument` are fetch, and fetch is the
 * server's tests' problem.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { doc, markSaved, picker, resetPicker } from './supersessions.svelte.ts';
import type { SupersessionRow } from '$lib/engine/supersession';

const row = (name: string, uid: string): SupersessionRow => ({
  displayName: name,
  source: 'PHB',
  page: 'spells.html',
  hash: `${name.toLowerCase()}_phb`,
  prop: 'spell',
  replacedBy: [{ page: 'spells.html', prop: 'spell', uid }],
});

beforeEach(() => {
  doc.rows = [];
  doc.review = [];
  doc.overrides = [];
  resetPicker();
});

describe('doc', () => {
  it('takes an assignment from another module', () => {
    doc.rows = [row('Shield', 'Deflection|HB')];
    expect(doc.rows).toHaveLength(1);
    expect(doc.rows[0].displayName).toBe('Shield');
  });

  it('recomputes dirty after a write from outside the module', () => {
    doc.rows = [row('Shield', 'Deflection|HB')];
    markSaved();
    expect(doc.dirty).toBe(false);
    doc.rows = [...doc.rows, row('Mage Armor', 'Aegis|HB')];
    expect(doc.dirty).toBe(true);
  });

  it('sees a target swapped for another, though the count never moves', () => {
    doc.rows = [row('Shield', 'Deflection|HB')];
    markSaved();
    doc.rows = [row('Shield', 'Warding|HB')];
    expect(doc.dirty).toBe(true);
    expect(doc.rows[0].replacedBy[0].uid).toBe('Warding|HB');
  });

  it('counts a review note as a change', () => {
    doc.rows = [row('Shield', 'Deflection|HB')];
    markSaved();
    doc.review = [
      { replacement: 'Deflection|HB', reason: 'in part', targets: [] },
    ];
    expect(doc.dirty).toBe(true);
  });

  it('counts a new override rule as a change', () => {
    markSaved();
    doc.overrides = [
      {
        id: 'spell:A',
        prop: 'spell',
        from: 'A',
        targets: ['B'],
        exclude: [],
        rowCount: 3,
        keys: [],
        missing: false,
      },
    ];
    expect(doc.dirty).toBe(true);
  });

  it('counts unticking one entity inside a rule as a change', () => {
    const rule = {
      id: 'spell:A',
      prop: 'spell',
      from: 'A',
      targets: ['B'],
      exclude: [],
      rowCount: 3,
      keys: [],
      missing: false,
    };
    doc.overrides = [rule];
    markSaved();
    doc.overrides = [{ ...rule, exclude: ['spells.html|x_b'] }];
    expect(doc.dirty).toBe(true);
  });

  /**
   * Save is gated on `dirty`, and `loadDocument` throws before it mutates
   * anything - so a store whose read failed still holds zero rows. If that
   * reported dirty, Save would be armed to write an empty document over the
   * file the read failed on.
   */
  it('is clean before anything has been read', async () => {
    vi.resetModules();
    const fresh = await import('./supersessions.svelte.ts');
    expect(fresh.doc.rows).toHaveLength(0);
    expect(fresh.doc.dirty).toBe(false);
  });

  it('still reports dirty when a document that WAS read is emptied', () => {
    doc.rows = [row('Shield', 'Deflection|HB')];
    markSaved();
    doc.rows = [];
    expect(doc.dirty).toBe(true);
  });
});

describe('picker', () => {
  it('clears both lists and the edit target', () => {
    picker.newItems = [
      {
        source: 'HB',
        prop: 'spell',
        name: 'Deflection',
        hash: 'deflection_hb',
        isHomebrew: true,
      },
    ];
    picker.editingKeys = ['spells.html|shield_phb'];
    resetPicker();
    expect(picker.newItems).toEqual([]);
    expect(picker.replacedItems).toEqual([]);
    expect(picker.editingKeys).toEqual([]);
  });
});
