/**
 * content-links.test.ts — the broken-content-link audit.
 *
 * Covers the two reference families the audit distinguishes:
 *   - inline {@tag Name|Source} links (source position varies by tag), and
 *   - structured refs: _copy, baseItem, class wiring, prerequisites, and
 *     magicvariant `requires` blocks — whose property matchers are NOT name
 *     links (only `name` keys are; coded values only get source-suffix checks).
 */
import { describe, it, expect } from 'vitest';
import {
  extractEntityRefs,
  createLinkIndex,
  indexEntity,
  indexHomebrewMeta,
  indexSpecificVariants,
  buildLocalIndex,
  checkRef,
  checkEntity,
  issuesByRaw,
  applyLinkChecks,
  parseHomebrewFile,
  BARE_SCHEMA,
} from '../audit/index.ts';
import type { Entity } from '../types.ts';

// --- helpers -----------------------------------------------------------------

function indexWith(
  entries: [string, Entity][],
  opts: { homebrewMeta?: unknown; official?: string[] } = {},
) {
  const index = createLinkIndex();
  for (const prop of opts.official ?? []) index.officialProps.add(prop);
  if (opts.homebrewMeta) indexHomebrewMeta(index, opts.homebrewMeta);
  for (const [prop, e] of entries) indexEntity(index, prop, e);
  return index;
}

const BREW_META = { sources: [{ json: 'MyBrew', full: 'My Brew' }] };

// --- extraction ----------------------------------------------------------------

describe('extractEntityRefs — inline tags', () => {
  it('finds link tags deep in entries with name + source', () => {
    const refs = extractEntityRefs(
      {
        name: 'X',
        entries: [
          {
            type: 'entries',
            entries: [
              'You learn {@spell fireball|PHB} and {@item residuum|MyBrew|raw residuum}.',
            ],
          },
        ],
      },
      'item',
    );
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      kind: 'tag',
      props: ['spell'],
      name: 'fireball',
      source: 'PHB',
      at: 'entries',
    });
    expect(refs[1]).toMatchObject({
      name: 'residuum',
      source: 'MyBrew',
      raw: '{@item residuum|MyBrew|raw residuum}',
    });
  });

  it('reads the source from the right pipe slot for special tags', () => {
    const refs = extractEntityRefs(
      {
        entries: [
          '{@classFeature Rage|Barbarian|PHB|1|MyBrew} {@deity Auril|norse|MyBrew} {@condition grappled|XPHB|grappling}',
        ],
      },
      'item',
    );
    expect(refs.find((r) => r.name === 'Rage')?.source).toBe('MyBrew');
    expect(refs.find((r) => r.name === 'Auril')?.source).toBe('MyBrew');
    expect(refs.find((r) => r.name === 'grappled')?.source).toBe('XPHB');
  });

  it('ignores non-link tags (dice, dc, formatting)', () => {
    const refs = extractEntityRefs(
      {
        entries: [
          'Take {@damage 2d6} on a {@dc 15} save. {@b Bold.} {@dice 1d4}',
        ],
      },
      'item',
    );
    expect(refs).toHaveLength(0);
  });
});

describe('extractEntityRefs — structured refs vs requires blocks', () => {
  it('treats requires matchers as codes, not names — but name keys as base-item links', () => {
    const refs = extractEntityRefs(
      {
        name: 'V',
        requires: [{ type: 'A' }, { type: 'AF|XPHB' }, { name: 'Longsword' }],
        excludes: { net: true },
      },
      'magicvariant',
    );
    // {type:'A'} → nothing; {type:'AF|XPHB'} → source-only; {name:'Longsword'} → base-item name ref.
    expect(refs).toHaveLength(2);
    const srcOnly = refs.find((r) => !r.name);
    expect(srcOnly).toMatchObject({
      kind: 'requires',
      source: 'XPHB',
      props: [],
    });
    const nameRef = refs.find((r) => r.name);
    expect(nameRef).toMatchObject({
      kind: 'requires',
      name: 'Longsword',
      props: ['baseitem', 'item'],
    });
  });

  it('does not scan requires/excludes for inline tags', () => {
    const refs = extractEntityRefs(
      { requires: [{ type: 'A' }] },
      'magicvariant',
    );
    expect(refs).toHaveLength(0);
  });

  it('extracts _copy, baseItem, class wiring, attachedSpells, and prerequisites', () => {
    const refs = extractEntityRefs(
      {
        name: 'X',
        _copy: { name: 'Original', source: 'MyBrew' },
        baseItem: 'longsword|phb',
        attachedSpells: ['misty step#c', 'fog cloud|MyBrew'],
        prerequisite: [{ feat: ['grappler|phb'], spell: ['fireball'] }],
      },
      'item',
    );
    expect(refs.find((r) => r.kind === 'copy')).toMatchObject({
      name: 'Original',
      source: 'MyBrew',
      props: ['item'],
    });
    expect(refs.find((r) => r.at === 'baseItem')).toMatchObject({
      name: 'longsword',
      source: 'phb',
    });
    expect(refs.find((r) => r.raw === 'misty step#c')).toMatchObject({
      name: 'misty step',
      props: ['spell'],
    });
    expect(refs.find((r) => r.name === 'fog cloud')?.source).toBe('MyBrew');
    expect(
      refs.find((r) => r.kind === 'prerequisite' && r.props[0] === 'feat'),
    ).toMatchObject({ name: 'grappler', source: 'phb' });

    const cls = extractEntityRefs(
      { name: 'F', className: 'Fighter', classSource: 'PHB' },
      'subclass',
    );
    expect(cls.find((r) => r.at === 'className')).toMatchObject({
      props: ['class'],
      name: 'Fighter',
      source: 'PHB',
    });
  });
});

// --- checking ------------------------------------------------------------------

describe('checkRef severity model', () => {
  const index = indexWith(
    [
      ['spell', { name: 'Fireball', source: 'PHB' }],
      ['item', { name: 'Residuum', source: 'MyBrew' }],
    ],
    { homebrewMeta: BREW_META, official: ['spell', 'item'] },
  );

  const tagRef = (name: string, source?: string, props = ['item']) => ({
    kind: 'tag' as const,
    props,
    name,
    source,
    at: 'entries',
    raw: `{@item ${name}${source ? `|${source}` : ''}}`,
  });

  it('resolves case-insensitively', () => {
    expect(checkRef(tagRef('residuum', 'mybrew'), index)).toBeNull();
    expect(checkRef(tagRef('FIREBALL', 'PHB', ['spell']), index)).toBeNull();
  });

  it('errors on a missing name under a homebrew source (full coverage)', () => {
    const issue = checkRef(tagRef('Residuum Cake', 'MyBrew'), index);
    expect(issue?.severity).toBe('error');
    expect(issue?.msg).toContain('broken link');
  });

  it('warns when the name exists but not under the claimed source', () => {
    const issue = checkRef(tagRef('Residuum', 'PHB'), index);
    expect(issue?.severity).toBe('warning');
    expect(issue?.msg).toContain('not in source');
  });

  it('warns on an unknown source abbreviation', () => {
    const issue = checkRef(tagRef('Residuum', 'MyBrwe'), index);
    expect(issue?.severity).toBe('warning');
    expect(issue?.msg).toContain('unknown source');
  });

  it('stays silent for unverifiable official content (unindexed prop)', () => {
    expect(
      checkRef(
        {
          kind: 'tag',
          props: ['monster'],
          name: 'Tarrasque',
          source: 'MM',
          at: 'entries',
          raw: '{@creature Tarrasque|MM}',
        },
        index,
      ),
    ).toBeNull();
  });

  it('warns for an unsourced name missing from a fully-indexed prop', () => {
    const issue = checkRef(tagRef('Vorpal Spork'), index);
    expect(issue?.severity).toBe('warning');
  });

  it('checks source-only requires suffixes', () => {
    expect(
      checkRef(
        {
          kind: 'requires',
          props: [],
          name: '',
          source: 'XPHB',
          at: 'requires',
          raw: 'AF|XPHB',
        },
        index,
      ),
    ).toBeNull();
    const bad = checkRef(
      {
        kind: 'requires',
        props: [],
        name: '',
        source: 'XPBH',
        at: 'requires',
        raw: 'AF|XPBH',
      },
      index,
    );
    expect(bad?.severity).toBe('warning');
  });
});

describe('format validation + hover text', () => {
  const index = indexWith([], { official: ['spell'] });

  it('warns on unknown enricher tags, stays silent on known non-link tags', () => {
    const refs = extractEntityRefs(
      { entries: ['Roll {@dice 1d6} and {@spel fireball|PHB}.'] },
      'item',
    );
    const format = refs.find((r) => r.kind === 'format');
    expect(format?.problem).toMatchObject({ severity: 'warning' });
    expect(checkRef(format!, index)?.plain).toContain(
      'unknown enricher tag @spel',
    );
    expect(refs.filter((r) => r.kind === 'format')).toHaveLength(1); // @dice is fine
  });

  it('knows every tag 5etools renders, and not the ones it does not', () => {
    // Tag names from 5etools render.js that the registry used to miss.
    const real = [
      '{@subclass Forged|Druid|XPHB|MyBrew}',
      '{@subclassFluff Forged|Druid|XPHB|MyBrew}',
      '{@backgroundFluff Sage}',
      '{@classFluff Wizard}',
      '{@creatureFluff Goblin}',
      '{@itemFluff Longsword}',
      '{@raceFluff Elf}',
      '{@recipeFluff Stew}',
      '{@spellFluff Fireball}',
      '{@deck Deck of Many Things}',
      '{@crochet Owlbear}',
      '{@crochetFluff Owlbear}',
      '{@s2 x}',
      '{@strikeDouble x}',
      '{@u2 x}',
      '{@underlineDouble x}',
      '{@m}',
      '{@initiative 3}',
      '{@dcYourSpellSave}',
      '{@actSaveFailBy 5}',
      '{@help text|title}',
      '{@5etoolsImg pic|x.png}',
      '{@5etoolsAudio clip|x.mp3}',
    ];
    const refs = extractEntityRefs({ entries: real }, 'item');
    expect(refs.filter((r) => r.kind === 'format')).toEqual([]);

    // render.js has no handler for these, so 5etools prints them as plain text.
    const fake = extractEntityRefs(
      { entries: ['{@monster Goblin}', '{@strikethrough x}'] },
      'item',
    );
    expect(fake.map((r) => r.problem?.reason)).toEqual([
      'unknown enricher tag @monster',
      'unknown enricher tag @strikethrough',
    ]);
  });

  it('links @subclass by short name, with a source that defaults to PHB', () => {
    const scIndex = indexWith(
      [
        [
          'subclass',
          {
            name: 'Circle of the Forged',
            shortName: 'Forged',
            source: 'MyBrew',
          },
        ],
      ],
      { homebrewMeta: BREW_META, official: ['subclass'] },
    );
    const [ok] = extractEntityRefs(
      { entries: ['{@subclass Forged|Druid|XPHB|MyBrew}'] },
      'item',
    );
    expect(ok).toMatchObject({ kind: 'tag', name: 'Forged', source: 'MyBrew' });
    expect(checkRef(ok, scIndex)).toBeNull();

    // The class source is NOT the subclass source: this one looks in PHB.
    const [unsourced] = extractEntityRefs(
      { entries: ['{@subclass Forged|Druid|MyBrew}'] },
      'item',
    );
    expect(checkRef(unsourced, scIndex)?.severity).toBe('error');
  });

  it('errors on a link tag missing its name', () => {
    const refs = extractEntityRefs(
      { entries: ['A {@spell |PHB} slot.'] },
      'item',
    );
    const issue = checkRef(refs[0], index);
    expect(issue?.severity).toBe('error');
    expect(issue?.plain).toContain('invalid format');
  });

  it('every issue carries a plain-text reason alongside the HTML message', () => {
    const issue = checkRef(
      {
        kind: 'tag',
        props: ['spell'],
        name: 'Znork',
        source: undefined,
        at: 'entries',
        raw: '{@spell Znork}',
      },
      index,
    );
    expect(issue?.plain).not.toContain('<');
    expect(issue?.msg).toContain('<code>entries</code>');
  });
});

describe('generated magic-item variants', () => {
  const weapon = { weapon: true, type: 'M' };
  const bases = [
    { name: 'Longsword', source: 'PHB', edition: 'classic', ...weapon },
    { name: 'Longsword', source: 'XPHB', edition: 'one', ...weapon },
    { name: 'Pitchfork', source: 'MyBrew', ...weapon },
    { name: 'Arrows (20)', source: 'PHB', packContents: ['Arrow'], ...weapon },
    { name: 'Rope', source: 'PHB', edition: 'classic' },
  ] as unknown as Entity[];
  const variants = [
    {
      name: '+1 Weapon',
      edition: 'classic',
      requires: [{ weapon: true }],
      inherits: { namePrefix: '+1 ', source: 'DMG' },
    },
    {
      name: '+1 Weapon',
      edition: 'one',
      requires: [{ weapon: true }],
      inherits: { namePrefix: '+1 ', source: 'XDMG' },
    },
    {
      name: 'Silvered Weapon',
      requires: [{ weapon: true }],
      excludes: { name: 'Pitchfork' },
      inherits: { namePrefix: 'Silvered ', source: 'DMG' },
    },
    {
      name: 'Very Rare Poisonous',
      requires: [{ type: ['M', 'R'] }],
      inherits: {
        nameSuffix: ' (Poisonous)',
        nameRemove: 'Long',
        source: 'MyBrew',
      },
    },
  ] as unknown as Entity[];
  const index = indexWith([], { homebrewMeta: BREW_META, official: ['item'] });
  indexSpecificVariants(index, bases, variants);
  const sources = (name: string) =>
    [...(index.sourcesByName.get('item')?.get(name) ?? [])].sort();

  it('builds one item per base × variant, matching 5etools editions', () => {
    expect(sources('+1 longsword')).toEqual(['DMG', 'XDMG']);
    expect(sources('+1 pitchfork')).toEqual(['DMG', 'XDMG']); // unmarked base takes both
  });

  it('skips pack items, unmet requires and matched excludes', () => {
    expect(sources('+1 arrows (20)')).toEqual([]);
    expect(sources('+1 rope')).toEqual([]);
    expect(sources('silvered pitchfork')).toEqual([]);
    expect(sources('silvered longsword')).toEqual(['DMG']);
  });

  it('applies nameRemove before the prefix and suffix', () => {
    expect(sources('sword (poisonous)')).toEqual(['MyBrew']);
  });

  it('resolves an unsourced {@item +1 longsword} to the DMG one', () => {
    const [ref] = extractEntityRefs(
      { entries: ['{@item +1 longsword}'] },
      'item',
    );
    expect(checkRef(ref, index)).toBeNull();
  });
});

describe('unsourced links to types without official data', () => {
  const brewTable = [
    'table',
    { name: 'Indefinite Madness', source: 'MyBrew' },
  ] as [string, Entity];
  const [ref] = extractEntityRefs(
    { entries: ['{@table indefinite madness}'] },
    'item',
  );

  it('only warns when the default source is not indexed for the type', () => {
    const index = indexWith([brewTable], { homebrewMeta: BREW_META });
    const issue = checkRef(ref, index);
    expect(issue?.severity).toBe('warning');
    expect(issue?.plain).toContain('possible dead link');
  });

  it('resolves once official tables are indexed', () => {
    const index = indexWith(
      [brewTable, ['table', { name: 'Indefinite Madness', source: 'DMG' }]],
      { homebrewMeta: BREW_META, official: ['table'] },
    );
    expect(checkRef(ref, index)).toBeNull();
  });

  it('still errors when official data is indexed and the default lacks it', () => {
    const index = indexWith([brewTable], {
      homebrewMeta: BREW_META,
      official: ['table'],
    });
    expect(checkRef(ref, index)?.severity).toBe('error');
  });
});

describe('checkEntity + issuesByRaw', () => {
  it('dedupes per entity and keys issues by raw span (errors win)', () => {
    const index = indexWith([], {
      homebrewMeta: BREW_META,
      official: ['spell'],
    });
    const issues = checkEntity(
      { name: 'X', entries: ['{@spell zap|MyBrew} and {@spell zap|MyBrew}'] },
      'item',
      index,
    );
    expect(issues).toHaveLength(1);
    const map = issuesByRaw(issues);
    expect(map.get('{@spell zap|MyBrew}')?.severity).toBe('error');
  });
});

// --- end-to-end over a parsed file ----------------------------------------------

describe('applyLinkChecks', () => {
  const doc = {
    _meta: { sources: [{ json: 'LocalBrew' }] },
    item: [
      {
        name: 'Widget',
        source: 'LocalBrew',
        entries: ['Pairs with {@item Gadget|LocalBrew}.'],
      }, // self-ref, ok
      {
        name: 'Gadget',
        source: 'LocalBrew',
        entries: ['See {@item Gizmo|LocalBrew}.'],
      }, // broken
      {
        name: 'Doodad',
        source: 'LocalBrew',
        entries: ['Casts {@spell fireball|PHB} twice: {@spell fireball|PHB}.'],
      }, // ok + deduped
    ],
  };

  it('resolves self-references, flags broken ones, dedupes repeats, and fills totals', () => {
    const index = indexWith([['spell', { name: 'Fireball', source: 'PHB' }]], {
      official: ['spell', 'item'],
    });
    const parsed = parseHomebrewFile(doc, () => BARE_SCHEMA);
    const result = applyLinkChecks(doc, parsed, index);

    expect(result.totals.brokenLinks).toBe(1);
    expect(parsed.totals.brokenLinks).toBe(1);
    const broken = result.nodes.find((n) => n.entityIdx === 1);
    expect(broken?.errors[0].raw).toBe('{@item Gizmo|LocalBrew}');
    expect(parsed.nodes[1].linkErrors).toHaveLength(1);
    expect(parsed.nodes[0].linkErrors).toBeUndefined(); // clean nodes stay untouched
    expect(parsed.nodes[2].linkErrors).toBeUndefined();
  });

  it('buildLocalIndex marks the file’s own sources as homebrew (full coverage)', () => {
    const local = buildLocalIndex(doc);
    expect(local.homebrewSources.has('localbrew')).toBe(true);
    expect(local.byPropSource.get('item')?.has('widget|localbrew')).toBe(true);
  });
});

// --- default sources + 2014/2024 editions ------------------------------------------

describe('checkRef — unsourced tags resolve to the tag default', () => {
  const index = indexWith(
    [
      [
        'spell',
        { name: 'Fireball', source: 'PHB', reprintedAs: ['Fireball|XPHB'] },
      ],
      ['spell', { name: 'Fireball', source: 'XPHB' }],
      ['spell', { name: 'Brewbolt', source: 'MyBrew' }],
      ['baseitem', { name: 'Longsword', source: 'PHB' }],
    ],
    { homebrewMeta: BREW_META, official: ['spell', 'baseitem'] },
  );
  index.sourceEdition.set('phb', 'classic');
  index.sourceEdition.set('xphb', 'one');
  const tag = (raw: string) =>
    extractEntityRefs({ name: 'X', entries: [raw] }, 'feat')[0];

  it('errors when an unsourced tag names homebrew content (never reachable)', () => {
    const issue = checkRef(tag('{@spell brewbolt}'), index);
    expect(issue?.severity).toBe('error');
    expect(issue?.plain).toContain('looks in PHB');
    expect(issue?.plain).toContain('|MyBrew');
  });

  it('errors when the default source lacks the name ({@item longsword} → DMG)', () => {
    const issue = checkRef(tag('{@item longsword}'), index);
    expect(issue?.severity).toBe('error');
    expect(issue?.plain).toContain('|PHB');
  });

  it('is silent for an unsourced tag that resolves, in a classic brew', () => {
    expect(checkRef(tag('{@spell fireball}'), index)).toBeNull();
    expect(
      checkRef(tag('{@spell fireball}'), index, undefined, {
        edition: 'classic',
      }),
    ).toBeNull();
  });

  it('warns in a 2024 brew when a link lands on a reprinted 2014 entity', () => {
    const unsourced = checkRef(tag('{@spell fireball}'), index, undefined, {
      edition: 'one',
    });
    expect(unsourced?.severity).toBe('warning');
    expect(unsourced?.plain).toContain('reprinted as "Fireball" (XPHB)');
    const explicit = checkRef(tag('{@spell fireball|PHB}'), index, undefined, {
      edition: 'one',
    });
    expect(explicit?.severity).toBe('warning');
    expect(
      checkRef(tag('{@spell fireball|XPHB}'), index, undefined, {
        edition: 'one',
      }),
    ).toBeNull();
  });

  it('applyLinkChecks reads the edition from _meta', () => {
    const doc = {
      _meta: { ...BREW_META, edition: 'one' },
      feat: [{ name: 'F', source: 'MyBrew', entries: ['{@spell fireball}'] }],
    };
    const parsed = parseHomebrewFile(doc, () => BARE_SCHEMA);
    const res = applyLinkChecks(doc, parsed, index);
    expect(res.totals.linkWarnings).toBe(1);
  });

  it('(sub)class features fall back to the (sub)class source, not PHB', () => {
    const idx = indexWith(
      [['subclassFeature', { name: 'Spell Rage', source: 'MyBrew' }]],
      { homebrewMeta: BREW_META, official: ['subclassFeature'] },
    );
    const ref = extractEntityRefs(
      {
        name: 'X',
        entries: [
          '{@subclassFeature Spell Rage|Barbarian|PHB|Rage Mage|MyBrew|3}',
        ],
      },
      'feat',
    )[0];
    expect(ref.defaultSource).toBe('MyBrew');
    expect(checkRef(ref, idx)).toBeNull();
  });

  it('edition warnings ignore homebrew-to-homebrew reprints', () => {
    const idx = indexWith(
      [
        [
          'monster',
          { name: 'Husk', source: 'MyBrew', reprintedAs: ['Husk|OtherBrew'] },
        ],
      ],
      { homebrewMeta: BREW_META, official: ['monster'] },
    );
    const ref = extractEntityRefs(
      { name: 'X', entries: ['{@creature husk|MyBrew}'] },
      'feat',
    )[0];
    expect(checkRef(ref, idx, undefined, { edition: 'one' })).toBeNull();
  });
});
