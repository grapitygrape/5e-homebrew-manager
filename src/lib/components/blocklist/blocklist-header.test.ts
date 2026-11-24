/**
 * Server-side render tests for BlocklistHeader and unit tests for BlocklistPage
 * list application, dirty tracking, and unmatched-source cleanup.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type { LoadedBlocklist } from '$lib/api';
import { entryKey, type BlocklistEntry } from '$lib/engine/blocklist';
import { BlocklistPage } from '$lib/state/blocklist-page.svelte.ts';
import BlocklistHeader from './BlocklistHeader.svelte';

const entry = (over: Partial<BlocklistEntry> = {}): BlocklistEntry => ({
  source: 'PHB',
  displayName: '*',
  hash: '*',
  category: '*',
  isAuto: false,
  ...over,
});

const doc = (over: Partial<LoadedBlocklist> = {}): LoadedBlocklist => ({
  entries: [entry()],
  envelope: {},
  diagnoses: [],
  counts: {},
  collapsed: [],
  repairedCount: 0,
  duplicatesRemoved: 0,
  exists: true,
  ...over,
});

const cleanHtml = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');

describe('BlocklistHeader', () => {
  it('renders rule count, actions, and missing-file / unsaved indicators', () => {
    const page = new BlocklistPage();
    page.applyList(doc({ exists: false, entries: [entry()] }));
    page.loadingList = false;
    page.entries = [entry(), entry({ source: 'DMG' })];

    const body = cleanHtml(
      render(BlocklistHeader, {
        props: { page, canSave: true, canDeploy: false },
      }).body,
    );

    expect(body).toContain('Manage Sources, Homebrew, and Allowed Content');
    expect(body).toContain('2 rules');
    expect(body).toContain('no content-blocklist.json yet - Save creates it');
    expect(body).toContain('unsaved changes');
    expect(body).toContain('Import blocklist');
    expect(body).toContain('Export');
    expect(body).toContain('Deploy');
  });
});

describe('BlocklistPage', () => {
  it('marks repaired or unknown-source loads with a warning banner and removes unmatched entries', () => {
    const page = new BlocklistPage();
    const kept = entry({ source: 'PHB' });
    const missing = entry({ source: 'GONE' });
    page.applyList(
      doc({
        entries: [kept, missing],
        repairedCount: 1,
        duplicatesRemoved: 2,
        diagnoses: [
          {
            key: entryKey(missing),
            level: 'warning',
            code: 'unknown-source',
            message: 'missing',
          },
        ],
      }),
    );

    expect(page.dirty).toBe(true);
    expect(page.banner?.tone).toBe('warn');
    expect(page.banner?.text).toContain('1 rule');
    expect(page.banner?.text).toContain('2 duplicate rules dropped');
    expect(page.banner?.action?.label).toBe('Remove unmatched sources');

    page.removeUnmatched();
    expect(page.entries.map((e) => e.source)).toEqual(['PHB']);
    expect(page.banner?.tone).toBe('ok');
  });

  it('tracks clean vs dirty state on clean loads', () => {
    const page = new BlocklistPage();
    page.applyList(doc());
    expect(page.dirty).toBe(false);
    page.entries = [];
    expect(page.dirty).toBe(true);
  });
});
