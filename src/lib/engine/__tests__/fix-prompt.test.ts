/** Tests for engine/audit/fix-prompt.ts — the copy-to-model fix prompt. */
import { describe, it, expect } from 'vitest';
import {
  buildFixPrompt,
  describeFixPrompt,
  type FixPromptInput,
} from '../audit/fix-prompt.ts';
import { parseModelReply } from '../audit/brew-merge.ts';

const doc = {
  _meta: { sources: [{ json: 'AltArtificer', abbreviation: 'AA' }] },
  class: [{ name: 'Artificer', source: 'AltArtificer' }],
  classFeature: [
    { name: 'Clean Feature', source: 'AltArtificer', entries: ['fine'] },
    {
      name: 'Infusions',
      source: 'AltArtificer',
      entries: [
        'See {@item Missing Thing|AltArtificer}.',
        'Cast {@spell firebolt}.',
      ],
    },
  ],
  subclass: [
    { _copy: { name: 'Alchemist', source: 'TCE' }, name: 'Alt Alchemist' },
  ],
};

const base: FixPromptInput = {
  file: 'LaserLlama; Alternate Artificer.json',
  doc,
  issues: [
    {
      type: 'classFeature',
      entityIdx: 1,
      name: 'Infusions',
      schemaErrors: [{ message: 'must have required property "level"' }],
      schemaWarnings: [],
      linkErrors: [
        {
          severity: 'error',
          msg: '<code>entries</code> …',
          plain: 'No item named "Missing Thing" in source AltArtificer',
          raw: '{@item Missing Thing|AltArtificer}',
          at: 'entries',
        },
      ],
      linkWarnings: [],
    },
    {
      type: 'subclass',
      entityIdx: 0,
      name: 'Alt Alchemist',
      schemaErrors: [],
      schemaWarnings: [{ message: 'shortName is recommended' }],
      linkErrors: [],
      linkWarnings: [],
    },
  ],
};

describe('buildFixPrompt', () => {
  it('names the file and keeps the fix local', () => {
    const { text } = buildFixPrompt(base);
    expect(text).toContain('`LaserLlama; Alternate Artificer.json`');
    expect(text).toMatch(/don't suggest uploading/i);
  });

  it('includes the JSON of entities with problems and leaves clean ones out', () => {
    const { text } = buildFixPrompt(base);
    expect(text).toContain('"name": "Infusions"');
    expect(text).toContain('"name": "Alt Alchemist"');
    expect(text).not.toContain('Clean Feature');
  });

  it('lists each problem under its entity, with the raw link text', () => {
    const { text } = buildFixPrompt(base);
    const section = text.slice(text.indexOf('classFeature: Infusions'));
    expect(section).toContain('must have required property "level"');
    expect(section).toContain('`{@item Missing Thing|AltArtificer}`');
    expect(section).toContain(
      'No item named "Missing Thing" in source AltArtificer',
    );
  });

  it("doesn't repeat link text the message already quotes", () => {
    const raw = '{@spell firebolt}';
    const { text } = buildFixPrompt({
      ...base,
      issues: [
        {
          ...base.issues[0],
          schemaErrors: [],
          linkErrors: [
            {
              severity: 'error',
              msg: '',
              plain: `broken link ${raw} — no spell named "firebolt" found`,
              raw,
              at: 'entries',
            },
          ],
        },
      ],
    });
    expect(text.split(raw)).toHaveLength(3); // message + entity JSON
    expect(text).toContain(
      `- broken link (in \`entries\`): broken link ${raw} — no spell named "firebolt" found`,
    );
  });

  it('cites only the guides for types with problems, plus the copy spec for _copy', () => {
    const { text, guides } = buildFixPrompt(base);
    expect(guides).toEqual([
      'classfeature-conversion.md',
      'subclass-conversion.md',
      'Spec_Copy.md',
    ]);
    expect(text).toContain('`classfeature-conversion.md`');
    expect(text).not.toContain('`class-conversion.md`');
  });

  it('names the guide under each entity, by full path when the folder is known', () => {
    const { text } = buildFixPrompt({
      ...base,
      guidesPath: 'Q:\\hbm\\guides\\',
    });
    const feature = text.slice(
      text.indexOf('### classFeature: Infusions'),
      text.indexOf('### subclass'),
    );
    expect(feature).toContain(
      'Guide: `Q:\\hbm\\guides\\classfeature-conversion.md`',
    );
    const subclass = text.slice(text.indexOf('### subclass: Alt Alchemist'));
    expect(subclass).toContain(
      'Guides: `Q:\\hbm\\guides\\subclass-conversion.md`, `Q:\\hbm\\guides\\Spec_Copy.md`',
    );
    const posix = buildFixPrompt({ ...base, guidesPath: 'q:/hbm/guides' });
    expect(posix.text).toContain('`q:/hbm/guides/classfeature-conversion.md`');
  });

  it('points weapon and tool items at their own guide before the item guide', () => {
    const items = {
      _meta: doc._meta,
      item: [
        { name: 'Shock Blade', source: 'AA', type: 'M|XPHB' },
        { name: 'Odd Lute', source: 'AA', type: 'INS' },
        { name: 'Plain Ring', source: 'AA', type: 'RG' },
      ],
      magicvariant: [
        { name: 'Biting', requires: [{ weapon: true }], inherits: {} },
      ],
    };
    const issue = (type: string, entityIdx: number) => ({
      ...base.issues[1],
      type,
      entityIdx,
      name: null,
    });
    const { text } = buildFixPrompt({
      file: 'x.json',
      doc: items,
      issues: [
        issue('item', 0),
        issue('item', 1),
        issue('item', 2),
        issue('magicvariant', 0),
      ],
    });
    expect(text).toContain(
      '`item[0]`)\n\nGuides: `weapon-conversion.md`, `item-conversion.md`',
    );
    expect(text).toContain(
      '`item[1]`)\n\nGuides: `tool-conversion.md`, `item-conversion.md`',
    );
    expect(text).toContain('`item[2]`)\n\nGuide: `item-conversion.md`');
    expect(text).toContain(
      '`magicvariant[0]`)\n\nGuides: `weapon-conversion.md`, `magicvariant-conversion.md`',
    );
  });

  it('cites a reference doc when a problem names its property', () => {
    const { guides } = buildFixPrompt({
      ...base,
      issues: [
        {
          ...base.issues[1],
          schemaWarnings: [{ message: 'Unknown property prerequisite' }],
        },
      ],
    });
    expect(guides).toContain('prerequisite-reference.md');
  });

  it('asks for a reply Merge reply can read: one block keyed by array property', () => {
    const { text } = buildFixPrompt(base);
    const reply = text.slice(text.indexOf('## Reply with'));
    expect(reply).toContain('keyed by its array property');
    expect(reply).toContain('"classFeature": [{ "name": "…", "source": "…" }]');
    expect(text).not.toMatch(/in its own JSON block/);
    // The example itself is a reply Merge reply accepts.
    const example = reply.slice(reply.indexOf('```json'));
    expect(
      parseModelReply(example.slice(0, example.indexOf('```\n', 7) + 3)),
    ).toMatchObject({ props: { classFeature: [{ name: '…' }] } });
  });

  it("gives the file's edition and how to tag for it", () => {
    const one = buildFixPrompt({
      ...base,
      doc: { ...doc, _meta: { ...doc._meta, edition: 'one' } },
    });
    expect(one.text).toContain('`{@spell fireball|xphb}`');
    const classic = buildFixPrompt({
      ...base,
      doc: { ...doc, _meta: { ...doc._meta, edition: 'classic' } },
    });
    expect(classic.text).toContain('A 2024 source (`xphb`');
  });

  it('collapses a problem repeated in one entity into a single line', () => {
    const broken = base.issues[0].linkErrors[0];
    const { text, problems } = buildFixPrompt({
      ...base,
      issues: [{ ...base.issues[0], linkErrors: [broken, broken, broken] }],
    });
    expect(text).toContain(
      'No item named "Missing Thing" in source AltArtificer (×3)',
    );
    expect(problems).toBe(4); // still counts each occurrence
  });

  it('gives the path on disk when known', () => {
    const { text } = buildFixPrompt({
      ...base,
      filePath: 'Q:/5e/homebrew/LaserLlama; Alternate Artificer.json',
    });
    expect(text).toContain(
      '- File: `Q:/5e/homebrew/LaserLlama; Alternate Artificer.json`',
    );
  });

  it('adds lint failures and collisions as file-level problems, skipping info', () => {
    const { text, problems } = buildFixPrompt({
      ...base,
      lint: [
        {
          severity: 'error',
          rule: 'meta.dateAdded',
          message: '_meta.dateAdded is missing',
        },
        { severity: 'info', rule: 'folder', message: 'belongs in class/' },
      ],
      collisions: [
        {
          kind: 'entity',
          severity: 'warning',
          message: 'classFeature "Infusions" also defined in Other.json',
          files: ['Other.json'],
        },
      ],
    });
    expect(text).toContain('`meta.dateAdded`');
    expect(text).toContain('_meta.dateAdded is missing');
    expect(text).toContain('also defined in Other.json');
    expect(text).not.toContain('belongs in class/');
    expect(problems).toBe(5); // 3 entity problems + 1 lint error + 1 collision
  });

  it('reports the file contents and schema version for context', () => {
    const { text } = buildFixPrompt({ ...base, schemaVersion: '0.17.23' });
    expect(text).toContain('1 class, 2 classFeature, 1 subclass');
    expect(text).toContain('AltArtificer');
    expect(text).toContain('5etools-utils v0.17.23');
  });

  it('counts problems and entities, and reports zero for a clean file', () => {
    expect(buildFixPrompt(base)).toMatchObject({ problems: 3, entities: 2 });
    expect(buildFixPrompt({ ...base, issues: [] })).toMatchObject({
      problems: 0,
      entities: 0,
    });
  });
});

describe('describeFixPrompt', () => {
  it('says what was copied, with plurals', () => {
    expect(describeFixPrompt(buildFixPrompt(base))).toBe(
      'Copied a fix prompt: 3 problems in 2 entities. Press "Merge new content" and paste the reply there.',
    );
  });

  it('says so when there is nothing to fix', () => {
    expect(describeFixPrompt(buildFixPrompt({ ...base, issues: [] }))).toBe(
      'Nothing to fix: no errors, warnings or lint failures.',
    );
  });
});
