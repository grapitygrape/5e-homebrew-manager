/**
 * Tests for content-index-service: dependency loading, parent → child lookups
 * and the disk cache.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  getContentIndex,
  listAllowedWithBlockedParents,
  listBlocklistChildren,
  listSources,
  resetContentIndex,
} from '../content-index-service.ts';
import { setConfigProvider } from '../config.ts';
import { getDataSource, resetDataSource } from '../datasource.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { nodeConfigProvider } from '$lib/server/config-store';
import { encodeForHash } from '$lib/engine/blocklist';

let root = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-content-index-'));
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

/** Point services at an hbm-config.json in `root`, as the desktop shell does. */
async function useConfig(stored: unknown): Promise<void> {
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(configPath, JSON.stringify(stored));
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
  resetDataSource();
}

describe('listSources dependencies', () => {
  /** A one-monster brew declaring `code`, with optional `_meta.dependencies`. */
  const brew = (code: string, deps?: string[]) => ({
    _meta: {
      sources: [{ json: code, abbreviation: code, full: `${code} Book` }],
      ...(deps && { dependencies: { monster: deps } }),
    },
    monster: [{ name: `${code} Beast`, source: code }],
  });

  it('follows dependencies of partnered files and of other dependencies, as 5etools does', async () => {
    const dataDir = path.join(root, 'data');
    const brewDir = path.join(root, 'homebrew');
    const repo = path.join(root, 'repo');
    await mkdir(dataDir, { recursive: true });
    await mkdir(brewDir, { recursive: true });
    await mkdir(path.join(repo, '_generated'), { recursive: true });
    await mkdir(path.join(repo, 'collection'), { recursive: true });

    await writeFile(
      path.join(dataDir, 'bestiary.json'),
      JSON.stringify({ monster: [] }),
    );
    // Local brew -> DepA -> DepB (a chain), and partnered Partner -> DepC.
    await writeFile(
      path.join(brewDir, 'local.json'),
      JSON.stringify(brew('Local', ['DepA'])),
    );
    const repoFiles: Record<string, unknown> = {
      'DepA.json': brew('DepA', ['DepB']),
      'DepB.json': brew('DepB'),
      'Partner.json': brew('Partner', ['DepC']),
      'DepC.json': brew('DepC'),
    };
    for (const [file, json] of Object.entries(repoFiles))
      await writeFile(
        path.join(repo, 'collection', file),
        JSON.stringify(json),
      );
    await writeFile(
      path.join(repo, '_generated', 'index-sources.json'),
      JSON.stringify(
        Object.fromEntries(
          Object.keys(repoFiles).map((f) => [
            f.replace('.json', ''),
            `collection/${f}`,
          ]),
        ),
      ),
    );
    await writeFile(
      path.join(repo, '_generated', 'index-meta.json'),
      JSON.stringify({ 'Partner.json': { p: 1 } }),
    );

    await useConfig({
      data: { path: './data' },
      homebrew: { path: './homebrew' },
      partnered: { path: './repo' },
    });
    resetContentIndex();

    const { sources } = await listSources(true);
    const tags = Object.fromEntries(
      sources.map((s) => [
        s.source,
        s.isDependency ? 'dependency' : s.isPartnered ? 'partnered' : 'local',
      ]),
    );
    expect(tags).toEqual({
      Local: 'local',
      DepA: 'dependency',
      DepB: 'dependency',
      Partner: 'partnered',
      DepC: 'dependency',
    });
  });
});

describe('listBlocklistChildren & listAllowedWithBlockedParents', () => {
  async function seedCorpus(): Promise<void> {
    const dataDir = path.join(root, 'data');
    const brewDir = path.join(root, 'homebrew');
    await mkdir(dataDir, { recursive: true });
    await mkdir(brewDir, { recursive: true });

    await writeFile(
      path.join(dataDir, 'classes.json'),
      JSON.stringify({
        class: [{ name: 'Artificer', source: 'TCE' }],
        subclass: [
          {
            name: 'Alchemist',
            shortName: 'Alchemist',
            source: 'TCE',
            className: 'Artificer',
            classSource: 'TCE',
          },
        ],
      }),
    );

    await writeFile(
      path.join(dataDir, 'races.json'),
      JSON.stringify({
        race: [
          {
            name: 'Human',
            source: 'PHB',
            subraces: [{ source: 'PHB' }, { name: 'Variant', source: 'PHB' }],
          },
          { name: 'Dwarf', source: 'PHB' },
        ],
        subrace: [
          {
            name: 'Duergar',
            source: 'MTF',
            raceName: 'Dwarf',
            raceSource: 'PHB',
          },
        ],
      }),
    );

    await writeFile(
      path.join(dataDir, 'items.json'),
      JSON.stringify({
        baseitem: [{ name: 'Greatsword', source: 'PHB' }],
        item: [
          { name: 'Frost Brand', source: 'DMG', baseItem: 'greatsword' },
          { name: 'Absorbing Tattoo, Acid', source: 'TCE' },
        ],
        itemGroup: [
          {
            name: 'Absorbing Tattoo',
            source: 'TCE',
            items: ['Absorbing Tattoo, Acid|TCE'],
          },
        ],
      }),
    );

    await writeFile(
      path.join(dataDir, 'decks-and-spells.json'),
      JSON.stringify({
        deck: [{ name: 'Deck of Many Things', source: 'DMG' }],
        card: [{ name: 'The Void', set: 'Deck of Many Things', source: 'DMG' }],
        spell: [{ name: 'Spirit of Death', source: 'BMT' }],
        monster: [
          {
            name: 'Reaper Spirit',
            source: 'BMT',
            summonedBySpell: 'Spirit of Death|BMT',
          },
        ],
      }),
    );

    await writeFile(
      path.join(brewDir, 'hb-artificer.json'),
      JSON.stringify({
        _meta: {
          sources: [{ json: 'HB', abbreviation: 'HB', full: 'Homebrew' }],
        },
        subclass: [
          {
            name: 'Maverick',
            shortName: 'Maverick',
            source: 'HB',
            className: 'Artificer',
            classSource: 'TCE',
          },
        ],
      }),
    );

    await useConfig({
      data: { path: './data' },
      homebrew: { path: './homebrew' },
    });
  }

  it('finds same-source and cross-source subclasses for a class, category, or whole source', async () => {
    await seedCorpus();

    const byClass = await listBlocklistChildren(
      'TCE',
      'class',
      encodeForHash('Artificer', 'TCE'),
    );
    expect(byClass.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'subclass:Alchemist:TCE',
      'subclass:Maverick:HB',
    ]);

    const bySource = await listBlocklistChildren('TCE', '*', '*');
    // Includes cross-source subclass Maverick (HB); TCE's own entities are seeds, not children of TCE.
    expect(bySource.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'subclass:Maverick:HB',
    ]);
  });

  it('finds race variants for base races (including (Base)), one per subrace', async () => {
    await seedCorpus();

    const dwarfKids = await listBlocklistChildren(
      'PHB',
      'race',
      encodeForHash('Dwarf', 'PHB'),
    );
    expect(dwarfKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      // The standalone `subrace` record is the same thing as the merged race
      // variant; listing it too would add two rules per subrace.
      'race:Dwarf (Duergar):MTF',
    ]);

    const humanKids = await listBlocklistChildren(
      'PHB',
      'race',
      encodeForHash('Human (Base)', 'PHB'),
    );
    expect(humanKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'race:Human:PHB',
      'race:Human (Variant):PHB',
    ]);
  });

  it('finds derived items, itemGroup members, deck cards, and summoned monsters', async () => {
    await seedCorpus();

    const swordKids = await listBlocklistChildren(
      'PHB',
      'baseitem',
      encodeForHash('Greatsword', 'PHB'),
    );
    expect(swordKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'item:Frost Brand:DMG',
    ]);

    const groupKids = await listBlocklistChildren(
      'TCE',
      'itemGroup',
      encodeForHash('Absorbing Tattoo', 'TCE'),
    );
    expect(groupKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'item:Absorbing Tattoo, Acid:TCE',
    ]);

    const deckKids = await listBlocklistChildren(
      'DMG',
      'deck',
      encodeForHash('Deck of Many Things', 'DMG'),
    );
    expect(deckKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'card:The Void:DMG',
    ]);

    const spellKids = await listBlocklistChildren(
      'BMT',
      'spell',
      encodeForHash('Spirit of Death', 'BMT'),
    );
    expect(spellKids.map((c) => `${c.prop}:${c.name}:${c.source}`)).toEqual([
      'monster:Reaper Spirit:BMT',
    ]);
  });

  it('lists allowed content whose parents are blocked across exact and wildcard rules', async () => {
    await seedCorpus();

    const orphans = await listAllowedWithBlockedParents([
      { hash: '*', category: '*', source: 'TCE' },
      { hash: encodeForHash('Dwarf', 'PHB'), category: 'race', source: 'PHB' },
    ]);
    expect(
      orphans.map(
        (o) =>
          `${o.prop}:${o.name}:${o.source}<-${o.blockedParents.map((p) => p.name).join(',')}`,
      ),
    ).toEqual([
      'subclass:Maverick:HB<-Artificer',
      'race:Dwarf (Duergar):MTF<-Dwarf',
    ]);
  });

  it('persists and hydrates the content index from disk, invalidating on edits or force refresh', async () => {
    await seedCorpus();

    const first = await getContentIndex();
    expect(first.entityCount).toBeGreaterThan(0);

    // Simulate a cold restart (empty in-memory cache) with unchanged files on disk.
    resetContentIndex();
    const readSpy = vi.spyOn(getDataSource(), 'readDataFiles');
    try {
      const hydrated = await getContentIndex();
      expect(readSpy).not.toHaveBeenCalled();
      expect(hydrated.entityCount).toBe(first.entityCount);
      expect(hydrated.sources).toEqual(first.sources);

      const kids = await listBlocklistChildren(
        'TCE',
        'class',
        encodeForHash('Artificer', 'TCE'),
      );
      expect(kids.map((k) => k.name)).toContain('Maverick');

      // Explicit refresh bypasses the disk cache and rescans.
      await listSources(true);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Editing a homebrew file changes the corpus stamp and triggers a rescan.
      readSpy.mockClear();
      resetContentIndex();
      const extraBrew = path.join(root, 'homebrew', 'extra.json');
      await writeFile(
        extraBrew,
        JSON.stringify({
          _meta: {
            sources: [{ json: 'EX', abbreviation: 'EX', full: 'Extra' }],
          },
          spell: [{ name: 'Spark', source: 'EX' }],
        }),
      );
      const future = new Date(Date.now() + 5000);
      await utimes(extraBrew, future, future);

      const updated = await getContentIndex();
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(updated.hasSource('EX')).toBe(true);
    } finally {
      readSpy.mockRestore();
    }
  });
});
