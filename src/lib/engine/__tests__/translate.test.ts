/** Tests for tags.ts, entries.ts, translate.ts — the rendering pipeline. */
import { describe, it, expect } from 'vitest';
import {
  parseInlineTags,
  stripInlineTags,
  withTagIssues,
} from '../render/tags.ts';
import { renderEntry } from '../render/entries.ts';
import { translateEntity } from '../render/translate.ts';
import type { Entity } from '../types.ts';

describe('parseInlineTags', () => {
  it('renders cross-link tags with custom display text', () => {
    const html = parseInlineTags('Cast {@spell fireball|phb|Fire}!');
    expect(html).toContain('<a href="#spells"');
    expect(html).toContain('data-name="fireball"');
    expect(html).toContain('>Fire</a>');
  });
  it('renders attack/hit/dc shorthands', () => {
    expect(parseInlineTags('{@atk mw}')).toBe('<em>Melee Weapon Attack:</em>');
    expect(parseInlineTags('{@hit 5}')).toBe('+5');
    expect(parseInlineTags('{@hit -1}')).toBe('-1');
    expect(parseInlineTags('{@dc 15}')).toBe('DC 15');
  });
  it('renders @subclass with display text from the fifth part', () => {
    const html = parseInlineTags(
      '{@subclass Forged|Druid|XPHB|MyBrew|the Forged}',
    );
    expect(html).toContain('<a href="#classes"');
    expect(html).toContain('data-name="Forged"');
    expect(html).toContain('>the Forged</a>');
    expect(parseInlineTags('{@subclass Forged|Druid|XPHB}')).toContain(
      '>Forged</a>',
    );
  });
  it('renders the newer statblock shorthands like 5etools', () => {
    expect(parseInlineTags('{@m}')).toBe('<em>Miss:</em> ');
    expect(parseInlineTags('{@initiative 3}')).toBe('+3');
    expect(parseInlineTags('{@initiative 3|+3 (13)}')).toBe('+3 (13)');
    expect(parseInlineTags('{@dcYourSpellSave}')).toBe('your spell save DC');
    expect(parseInlineTags('{@actSaveFailBy 5}')).toBe(
      '<em>Failure by 5 or More:</em>',
    );
    expect(parseInlineTags('{@s2 gone}')).toContain('double');
    expect(parseInlineTags('{@u2 key}')).toContain('double');
  });
  it('strips tags to plain text', () => {
    expect(stripInlineTags('a {@condition blinded} foe')).toBe('a blinded foe');
  });

  // Pipe semantics come from the shared tag registry (engine/tag-registry.ts).
  it('treats slot 1 of condition/status/disease as the SOURCE, not display text', () => {
    const html = parseInlineTags('{@condition grappled|XPHB|grappling}');
    expect(html).toContain('data-name="grappled"');
    expect(html).toContain('data-source="XPHB"');
    expect(html).toContain('>grappling</span>');
    // No display override → the name renders, never the source.
    expect(parseInlineTags('{@condition dazed|MyBrew}')).toContain(
      '>dazed</span>',
    );
  });
  it('reads the source from the right slot for coordinate-bearing tags', () => {
    expect(
      parseInlineTags('{@classFeature Rage|Barbarian|PHB|1|MyBrew}'),
    ).toContain('data-source="MyBrew"');
    expect(parseInlineTags('{@deity Auril|norse|MyBrew}')).toContain(
      'data-source="MyBrew"',
    );
  });
  it('resolves nested tags innermost-first', () => {
    const html = parseInlineTags('{@b {@item residuum|MyBrew}}');
    expect(html).toBe(
      '<strong><a href="#items" class="tag-item" data-name="residuum" data-source="MyBrew">residuum</a></strong>',
    );
  });
  it('renders formatting, dice, and 2024 statblock enrichers', () => {
    expect(parseInlineTags('{@i whisper}')).toBe('<em>whisper</em>');
    expect(parseInlineTags('{@dice 2d6+2|the dice}')).toBe(
      '<span class="tag-dice">the dice</span>',
    );
    expect(parseInlineTags('{@scaledamage 2d6|2-9|1d6}')).toBe(
      '<span class="tag-dice">1d6</span>',
    );
    expect(parseInlineTags('{@recharge 5}')).toBe('(Recharge 5–6)');
    expect(parseInlineTags('{@ability str 20}')).toBe('20 (+5)');
    expect(parseInlineTags('{@savingThrow dex 5}')).toBe('+5');
    expect(parseInlineTags('{@atkr m}')).toBe('<em>Melee Attack Roll:</em>');
    expect(parseInlineTags('{@actSave con}')).toBe(
      '<em>Constitution Saving Throw:</em>',
    );
    expect(parseInlineTags('{@h}')).toBe('<em>Hit:</em> ');
    expect(
      parseInlineTags('{@filter darkvision|races|Ability Bonus=Dexterity}'),
    ).toBe('darkvision');
  });
  it('degrades unknown tags to their first part and never leaks braces', () => {
    expect(parseInlineTags('{@somefuturetag Foo|Bar}')).toBe('Foo');
    expect(parseInlineTags('a { plain brace } stays')).toBe(
      'a { plain brace } stays',
    );
  });
  it('withTagIssues wraps the REAL output of broken tags with a hover reason', () => {
    const issues = new Map([
      [
        '{@spell zap|MyBrew}',
        {
          severity: 'error' as const,
          reason: 'no spell named "zap" in "MyBrew"',
        },
      ],
    ]);
    const html = withTagIssues(issues, () =>
      parseInlineTags('Cast {@spell zap|MyBrew} now'),
    );
    expect(html).toContain(
      '<span class="tag-issue tag-issue-error" title="no spell named &quot;zap&quot; in &quot;MyBrew&quot;">',
    );
    expect(html).toContain('data-name="zap"'); // real rendering preserved inside
    // outside the scope, nothing is highlighted
    expect(parseInlineTags('Cast {@spell zap|MyBrew} now')).not.toContain(
      'tag-issue',
    );
  });
});

describe('renderEntry', () => {
  it('wraps strings in paragraphs', () => {
    expect(renderEntry('hello')).toBe('<p>hello</p>');
  });
  it('renders lists and nested items', () => {
    const html = renderEntry({
      type: 'list',
      items: ['a', { name: 'Title', entry: 'body' }],
    });
    expect(html).toContain('<ul class="entry-list">');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<strong>Title.</strong> body');
  });
  it('renders tables with headers and rows', () => {
    const html = renderEntry({
      type: 'table',
      colLabels: ['d6', 'Result'],
      rows: [['1', 'Nothing']],
    });
    expect(html).toContain('<th>d6</th>');
    expect(html).toContain('<td>Nothing</td>');
  });
});

describe('translateEntity', () => {
  it('renders an item sheet with formatted cost', () => {
    const item: Entity = {
      name: 'Trinket',
      source: 'MyBrew',
      type: 'G',
      rarity: 'none',
      value: 500,
      weight: 1,
      entries: ['A trinket.'],
    };
    const out = translateEntity(item, 'item')!;
    expect(out._display!.html).toContain('Trinket');
    expect(out._display!.html).toContain('5 gp');
    expect(out._display!.properties.itemType).toBe('Adventuring Gear');
  });
  it('summarises a spell by level and school', () => {
    const spell: Entity = {
      name: 'Bolt',
      source: 'MyBrew',
      level: 1,
      school: 'V',
      time: [{ number: 1, unit: 'action' }],
      entries: ['Zap.'],
    };
    const out = translateEntity(spell, 'spell')!;
    expect(out._display!.textSummary).toContain('1st-level Evocation');
  });
  it('routes class features through the feat renderer', () => {
    const feat: Entity = {
      name: 'Second Wind',
      source: 'PHB',
      className: 'Fighter',
      level: 1,
      entries: ['Regain HP.'],
    };
    const out = translateEntity(feat, 'feat')!;
    expect(out._display!.html).toContain('Fighter Level 1');
    expect(out._display!.properties.parentClass).toBe('Fighter');
  });
  it('falls back to a generic sheet for unknown types', () => {
    const out = translateEntity(
      { name: 'Thing', source: 'X', entries: ['desc'] },
      'gizmo',
    )!;
    expect(out._display!.html).toContain('general-sheet');
  });
});
