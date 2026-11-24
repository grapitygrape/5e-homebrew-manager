/** Tests for engine/audit/convert-prompt.ts — the convert-to-homebrew prompt. */
import { describe, it, expect } from 'vitest';
import {
  buildConvertPrompt,
  type ConvertPromptInput,
} from '../audit/convert-prompt.ts';

const base: ConvertPromptInput = {
  source: 'Ember Lash\n1st-level evocation\nTake 2d6 fire damage.',
  file: 'Me; My Brew.json',
  filePath: 'C:/repos/5e/homebrew/Me; My Brew.json',
  doc: {
    _meta: {
      sources: [{ json: 'MyBrew', full: 'My Brew' }],
      edition: 'classic',
    },
    spell: [{ name: 'Frost Step', source: 'MyBrew' }],
  },
  paths: {
    guides: 'C:/repos/5e-homebrew-manager/guides',
    data: 'C:/repos/5e/data',
    homebrew: 'C:/repos/5e/homebrew',
    schema: 'C:/repos/5etools-utils/schema/brew',
  },
  schemaVersion: '0.17.23',
};

describe('buildConvertPrompt', () => {
  const text = buildConvertPrompt(base);

  it('points at every folder the model needs', () => {
    expect(text).toContain(
      'Conversion guides: `C:/repos/5e-homebrew-manager/guides`',
    );
    expect(text).toContain('5etools data: `C:/repos/5e/data`');
    expect(text).toContain('Homebrew folder: `C:/repos/5e/homebrew`');
    expect(text).toContain(
      'Brew schemas: `C:/repos/5etools-utils/schema/brew` (5etools-utils v0.17.23)',
    );
    expect(text).toContain('`Spec_Copy.md`');
  });

  it('lists each property with every guide that covers it', () => {
    expect(text).toContain(
      '- `item` (Item, Weapon, Tool): `item-conversion.md`, `weapon-conversion.md`, `tool-conversion.md`',
    );
    expect(text).toContain('- `race` (Ancestry): `ancestry-conversion.md`');
  });

  it("describes the target file's sources, edition and contents", () => {
    expect(text).toContain('- Path: `C:/repos/5e/homebrew/Me; My Brew.json`');
    expect(text).toContain(
      '- Source: `MyBrew` (My Brew). Every entry uses it.',
    );
    expect(text).toContain('- Edition: classic');
    expect(text).toContain('- Contents: 1 spell');
    expect(text).toContain('{@item dagger|phb}');
  });

  it('switches tag sourcing for a 2024 file', () => {
    const one = buildConvertPrompt({
      ...base,
      doc: { _meta: { sources: [{ json: 'MyBrew' }], edition: 'one' } },
    });
    expect(one).toContain('{@item dagger|xphb}');
    expect(one).not.toContain('{@item dagger|phb}');
    expect(one).toContain('"the Poisoned condition", "Fire damage"');
  });

  it('lowercases conditions and damage types for a 2014 file', () => {
    expect(text).toContain('"the poisoned condition", "fire damage"');
  });

  it('has the model pick the edition when the file has none', () => {
    const p = buildConvertPrompt({ ...base, doc: null });
    expect(p).toContain('- Edition: not set');
    expect(p).toContain("Put your choice in the reply's `_meta.edition`");
    expect(p).toContain('Add `_meta` only for `dependencies` and `edition`');
    expect(text).toContain('Add `_meta` only for `dependencies`,');
  });

  it('gives standard handling for recurring defects', () => {
    expect(text).toContain('## Standard handling');
    expect(text).toContain('add "(minimum of once)"');
    expect(text).toContain('Channel Divinity');
    expect(text).toContain('Fixed damage with no dice');
  });

  it('asks for dependencies on links into other brews', () => {
    expect(text).toContain('`meta.md`');
    expect(text).toContain(
      '`{@spell arcane ablation|KT-CLL}` needs `"spell": ["KT-CLL"]`',
    );
  });

  it('falls back to UNKNOWN when the file has no source', () => {
    const empty = buildConvertPrompt({
      ...base,
      doc: null,
      filePath: undefined,
    });
    expect(empty).toContain('Use `"UNKNOWN"` for every entry');
    expect(empty).not.toMatch(/ask me/i);
    expect(empty).toContain('- Contents: empty');
    expect(empty).not.toContain('- Path:');
  });

  it('asks for the reply the merge reads, plus defects and guide gaps', () => {
    expect(text).toContain(
      'One JSON block holding every converted entry, keyed by homebrew property',
    );
    expect(text).toContain('Fixes:');
    expect(text).toContain('Review:');
    expect(text).toContain('Guide gaps:');
  });

  it('fences the source so its own backticks cannot close the block', () => {
    const p = buildConvertPrompt({
      ...base,
      source: 'see ```this``` and ````that````',
    });
    expect(p).toContain('`````text\nsee ```this``` and ````that````\n`````\n');
  });

  it('converts first and never waits on an answer', () => {
    expect(text).toContain('Do the whole conversion in this reply');
    expect(text).not.toMatch(/ask me/i);
  });

  it('picks among several sources rather than asking', () => {
    const p = buildConvertPrompt({
      ...base,
      doc: { _meta: { sources: [{ json: 'A1brew' }, { json: 'B2brew' }] } },
    });
    expect(p).toContain(
      '- Sources: `A1brew`, `B2brew`. Use the one the text belongs to',
    );
  });

  it('leaves out folders it was not given', () => {
    const p = buildConvertPrompt({ ...base, paths: {} });
    expect(p).not.toContain('Conversion guides:');
    expect(p).toContain("If you can't open these folders");
  });
});
