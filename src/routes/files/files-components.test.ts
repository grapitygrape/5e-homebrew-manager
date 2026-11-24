/**
 * The Files view's row and index notice, rendered server-side. Pins what a
 * collapsed and an expanded row draw, and which index.json actions are offered.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import type { HomebrewFiles } from '$lib/api';
import { FilesPage } from '$lib/state/files-page.svelte';
import HomebrewFileRow from './HomebrewFileRow.svelte';
import IndexMismatchBanner from './IndexMismatchBanner.svelte';

type FileRow = HomebrewFiles['homebrew']['files'][number];

const file = (over: Partial<FileRow> = {}): FileRow =>
  ({
    file: 'Me; Brew.json',
    name: 'My Brew',
    authors: 'Me',
    size: 2048,
    mtime: 0,
    counts: { spell: 3 },
    sources: [{ json: 'MeBrew' }],
    error: undefined,
    ...over,
  }) as FileRow;

function row(opts: { open?: boolean; canDeploy?: boolean; f?: FileRow } = {}) {
  const page = new FilesPage();
  const f = opts.f ?? file();
  if (opts.open) page.toggleRow(f.file);
  // Svelte's hydration comments sit between a button and its label.
  return render(HomebrewFileRow, {
    props: { f, canDeploy: opts.canDeploy ?? false, page },
  }).body.replace(/<!--[\s\S]*?-->/g, '');
}

/** A button labelled exactly `label` (tooltips mention "Deployed" too). */
const button = (label: string) => new RegExp(`>\\s*${label}\\s*</button>`);

describe('HomebrewFileRow', () => {
  it('draws the name and byline collapsed, without the actions', () => {
    const body = row();
    expect(body).toContain('My Brew');
    expect(body).toContain('Me; Brew.json');
    expect(body).not.toContain('Scan for errors');
  });

  it('draws the actions and counts once expanded, Deploy only when allowed', () => {
    const open = row({ open: true });
    expect(open).toContain('Scan for errors');
    expect(open).toContain('Open in Parser');
    expect(open).toMatch(/spell/);
    expect(open).not.toMatch(button('Deploy'));
    expect(row({ open: true, canDeploy: true })).toMatch(button('Deploy'));
  });

  it('reports invalid JSON instead of counts', () => {
    const body = row({ open: true, f: file({ error: 'Unexpected token' }) });
    expect(body).toContain('Invalid JSON — Unexpected token');
  });
});

describe('IndexMismatchBanner', () => {
  it('offers keep/move for unlisted files and restore only from unused/', () => {
    const body = render(IndexMismatchBanner, {
      props: {
        index: {
          path: 'homebrew',
          unlisted: ['Stray; File.json'],
          missing: [
            { file: 'Gone; Back.json', inUnused: true },
            { file: 'Gone; Lost.json', inUnused: false },
          ],
        },
      },
    }).body;
    expect(body).toContain('Stray; File.json');
    expect(body).toContain('Keep all');
    expect(body).toContain('Restore all from unused/');
    expect(body.match(/>Restore</g)?.length).toBe(1);
    expect(body).toContain('Not in unused/ either');
  });

  it('draws nothing when the folder and index.json agree', () => {
    const body = render(IndexMismatchBanner, {
      props: { index: { path: 'homebrew', unlisted: [], missing: [] } },
    }).body;
    expect(body).not.toContain('index-list');
  });
});
