/** Tests for engine/merge/copy-applier.ts — faithful copyApplier port + tracing. */
import { describe, it, expect } from 'vitest';
import { applyCopy, newTrace } from '../merge/copy-applier.ts';
import { splitByTags } from '../merge/copy-math.ts';
import { expandVersions } from '../merge/copy-versions.ts';
import { resolveCopyTraced, getEntityKey } from '../merge/copy.ts';
import type { Entity } from '../types.ts';

const goblin: Entity = {
  name: 'Goblin',
  source: 'MM',
  page: 166,
  size: ['S'],
  cr: '1/4',
  dex: 14,
  wis: 8,
  senses: ['darkvision 60 ft.'],
  environment: ['forest'],
  action: [
    {
      name: 'Scimitar',
      entries: ['{@atk mw} {@hit 4} to hit. The goblin slashes.'],
    },
    { name: 'Shortbow', entries: ['{@atk rw} {@hit 4} to hit.'] },
  ],
};

describe('applyCopy', () => {
  it('inherits, drops preserve-only + per-prop fields, and traces why', () => {
    const trace = newTrace();
    const out = applyCopy(
      goblin,
      {
        name: 'Goblin Boss',
        source: 'X',
        _copy: { name: 'Goblin', source: 'MM' },
      },
      { prop: 'monster', trace },
    );
    expect(out.page).toBeUndefined();
    expect(out.environment).toBeUndefined(); // monster-specific preserve rule
    expect(out.cr).toBe('1/4');
    const drop = trace.steps.find(
      (s) => s.kind === 'drop' && s.prop === 'environment',
    );
    expect(drop?.detail).toContain('_preserve');
  });

  it('null on the child deletes the inherited prop', () => {
    const out = applyCopy(goblin, {
      name: 'G',
      senses: null,
      _copy: { name: 'Goblin', source: 'MM' },
    } as Entity);
    expect('senses' in out).toBe(false);
  });

  it('replaceTxt skips text inside tags and only hits entries', () => {
    const out = applyCopy(goblin, {
      name: 'Hobgoblin',
      _copy: {
        name: 'Goblin',
        source: 'MM',
        _mod: {
          action: {
            mode: 'replaceTxt',
            replace: 'goblin|hit',
            with: 'X',
            flags: 'i',
          },
        },
      },
    });
    const ent = (out.action as { entries: string[] }[])[0].entries[0];
    expect(ent).toBe('{@atk mw} {@hit 4} to X. The X slashes.');
  });

  it('`*` fans out to entry props and `_` runs last', () => {
    const trace = newTrace();
    const out = applyCopy(
      goblin,
      {
        name: 'Big',
        _copy: {
          name: 'Goblin',
          source: 'MM',
          _mod: {
            '*': { mode: 'scalarAddHit', scalar: 2 },
            _: {
              mode: 'addSenses',
              senses: { type: 'darkvision', range: 120 },
            },
          },
        },
      },
      { prop: 'monster', trace },
    );
    expect((out.action as { entries: string[] }[])[1].entries[0]).toContain(
      '{@hit 6}',
    );
    expect(out.senses).toEqual(['darkvision 120 ft.']);
    expect(trace.errors).toEqual([]);
  });

  it('replaceArr by regex, and a failed mod is traced instead of thrown', () => {
    const trace = newTrace();
    const out = applyCopy(
      goblin,
      {
        name: 'G',
        _copy: {
          name: 'Goblin',
          source: 'MM',
          _mod: {
            action: [
              {
                mode: 'replaceArr',
                replace: { regex: '^Short' },
                items: { name: 'Sling', entries: [] },
              },
              { mode: 'removeArr', names: 'Dagger' },
            ],
          },
        },
      },
      { trace },
    );
    expect((out.action as { name: string }[]).map((a) => a.name)).toEqual([
      'Scimitar',
      'Sling',
    ]);
    expect(trace.errors).toHaveLength(1);
    expect(trace.errors[0]).toContain('Dagger');
    expect(trace.steps.find((s) => !s.ok)?.mode).toBe('removeArr');
  });

  it('resolves <$variables$> against the merged entity', () => {
    const out = applyCopy(goblin, {
      name: 'G',
      _copy: {
        name: 'Goblin',
        source: 'MM',
        _mod: {
          trait: {
            mode: 'appendArr',
            items: {
              name: 'T',
              entries: ['DC <$dc__dex$>, <$to_hit__dex$>, <$short_name$>'],
            },
          },
        },
      },
    });
    expect((out.trait as { entries: string[] }[])[0].entries[0]).toBe(
      'DC 12, +4, the g',
    );
  });

  it('applies templates (_mod appended, _root never overwrites)', () => {
    const trace = newTrace();
    const out = applyCopy(
      goblin,
      {
        name: 'Zombie Goblin',
        cr: '1',
        _copy: {
          name: 'Goblin',
          source: 'MM',
          _templates: [{ name: 'Zombie', source: 'T' }],
        },
      },
      {
        prop: 'monster',
        trace,
        templates: [
          {
            name: 'Zombie',
            source: 'T',
            apply: {
              _root: { cr: '0', alignment: ['N'] },
              _mod: {
                _: {
                  mode: 'addSenses',
                  senses: { type: 'darkvision', range: 90 },
                },
              },
            },
          },
        ],
      },
    );
    expect(out.cr).toBe('1');
    expect(out.alignment).toEqual(['N']);
    expect(out.senses).toEqual(['darkvision 90 ft.']);
    expect(out._copy_templates).toEqual([{ name: 'Zombie', source: 'T' }]);
  });

  it('never mutates its inputs', () => {
    const child: Entity = {
      name: 'C',
      _copy: {
        name: 'Goblin',
        source: 'MM',
        _mod: { action: { mode: 'removeArr', names: 'Scimitar' } },
      },
    };
    const before = JSON.stringify([goblin, child]);
    applyCopy(goblin, child);
    expect(JSON.stringify([goblin, child])).toBe(before);
  });
});

describe('expandVersions', () => {
  it('expands _abstract/_implementations with {{variables}}', () => {
    const vers = expandVersions({
      name: 'Dragon Wing',
      source: 'X',
      entries: ['Base'],
      _versions: [
        {
          _abstract: {
            name: '{{color}} Wing',
            _mod: {
              entries: { mode: 'appendArr', items: 'Breathes {{dmg}}.' },
            },
          },
          _implementations: [
            { _variables: { color: 'Red', dmg: 'fire' } },
            { _variables: { color: 'Blue', dmg: 'lightning' } },
          ],
        },
      ],
    });
    expect(vers.map((v) => v.entity.name)).toEqual(['Red Wing', 'Blue Wing']);
    expect(vers[1].entity.entries).toEqual(['Base', 'Breathes lightning.']);
    expect(vers[0].entity._versionBase_name).toBe('Dragon Wing');
  });

  it('adds monster variant._version entries', () => {
    const vers = expandVersions(
      {
        ...goblin,
        variant: [
          {
            type: 'variant',
            name: 'Goblin Archer',
            _version: { addAs: 'action' },
            entries: ['Shoots.'],
          },
        ],
      },
      { prop: 'monster' },
    );
    expect(vers).toHaveLength(1);
    expect((vers[0].entity.action as { name: string }[]).at(-1)?.name).toBe(
      'Goblin Archer',
    );
  });
});

describe('resolveCopyTraced', () => {
  it('walks a multi-level chain and reports a missing parent', () => {
    const mid: Entity = {
      name: 'Mid',
      source: 'X',
      _copy: { name: 'Goblin', source: 'MM' },
      cr: '1',
    };
    const leaf: Entity = {
      name: 'Leaf',
      source: 'X',
      _copy: { name: 'Mid', source: 'X' },
    };
    const map = Object.fromEntries(
      [goblin, mid].map((e) => [
        getEntityKey(e as Record<string, unknown>, 'monster'),
        e,
      ]),
    );
    const r = resolveCopyTraced(leaf, map, 'monster');
    expect(r.chain.map((c) => c.name)).toEqual(['Mid', 'Goblin']);
    expect(r.entity.cr).toBe('1');
    expect(r.entity.dex).toBe(14);

    const orphan = resolveCopyTraced(
      { name: 'O', _copy: { name: 'Nope', source: 'X' } },
      map,
      'monster',
    );
    expect(orphan.trace.errors[0]).toContain('not found');
  });
});

describe('splitByTags', () => {
  it('keeps nested tags whole', () => {
    expect(splitByTags('a {@b x {@i y}} c')).toEqual([
      'a ',
      '{@b x {@i y}}',
      ' c',
    ]);
  });
});
