/** Tests for scripts/lib/upstream.ts and upstream-git.ts — the checks behind `upstream:check` and `upstream:update`. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import {
  diffFiles,
  enumChanges,
  isGenerated,
  mergeConflicts,
  newComponentClasses,
  parseCatFileBatch,
  patchApplies,
  patchBase,
  resolveModuleSource,
  schemaEnums,
  staleLists,
  touchedPages,
} from './upstream.ts';
import { clearShowCache, loadSchemasAtRef, show } from './upstream-git.ts';

const TEMPLATE = [
  '<div class="ve-mb-2 ve-split-v-center ve-w-100">',
  '\t<h4 class="ve-my-0 ve-italic">Input</h4>',
  '',
  '\t<button class="ve-btn ve-btn-default ve-btn-xs" id="btn-format">Format</button>',
  '</div>',
  '',
].join('\n');

// Our edit: a class on the Format button, the way the customizer's patch adds them.
const RESKIN = [
  'Reskin exported from 5e-testing 0814bc5, built on upstream v2.41.0 (32ef600)',
  'diff --git a/page.hbs b/page.hbs',
  '--- a/page.hbs',
  '+++ b/page.hbs',
  '@@ -2,4 +2,4 @@',
  ' \t<h4 class="ve-my-0 ve-italic">Input</h4>',
  ' ',
  '-\t<button class="ve-btn ve-btn-default ve-btn-xs" id="btn-format">Format</button>',
  '+\t<button class="ve-btn ve-btn-default ve-btn-xs control-bar" id="btn-format">Format</button>',
  ' </div>',
  '',
].join('\n');

// Upstream's next release wraps the same button, as v2.41.1 did.
const UPSTREAM_NEXT = TEMPLATE.replace(
  '\t<button class="ve-btn ve-btn-default ve-btn-xs" id="btn-format">Format</button>',
  '\t<div class="ve-flex-v-center">\n\t\t<div id="wrp-validation"></div>\n\t\t<button class="ve-btn ve-btn-default ve-btn-xs" id="btn-format">Format</button>\n\t</div>',
);

describe('patches', () => {
  it('diffFiles lists each file a patch changes, paths with spaces included', () => {
    expect(diffFiles(RESKIN)).toEqual(['page.hbs']);
    expect(diffFiles('diff --git a/a b.js b/a b.js\r\n')).toEqual(['a b.js']);
  });

  it('patchBase reads the upstream version from an export header', () => {
    expect(patchBase(RESKIN)).toEqual({
      describe: 'v2.41.0',
      commit: '32ef600',
    });
    expect(patchBase('diff --git a/x b/x')).toBeNull();
  });

  it('isGenerated covers pages, compiled CSS and the search index only', () => {
    expect(isGenerated('actions.html')).toBe(true);
    expect(isGenerated('css/main.css')).toBe(true);
    expect(isGenerated('search/index.json')).toBe(true);
    expect(isGenerated('scss/main.scss')).toBe(false);
    expect(isGenerated('node/generate-pages/template/page/x.hbs')).toBe(false);
    expect(isGenerated('js/render.js')).toBe(false);
  });
});

describe('cat-file batch & touched pages', () => {
  it('parseCatFileBatch decodes multi-byte UTF-8 blobs and skips missing entries', () => {
    const a = Buffer.from('{"title":"Crème — 5e"}\n', 'utf8');
    const b = Buffer.from('{"ok":true}', 'utf8');
    const payload = Buffer.concat([
      Buffer.from(`1111111 blob ${a.length}\n`),
      a,
      Buffer.from('\n'),
      Buffer.from('2222222 missing\n'),
      Buffer.from(`3333333 blob ${b.length}\n`),
      b,
      Buffer.from('\n'),
    ]);
    const map = parseCatFileBatch(payload, ['a.json', 'gone.json', 'sub/b.json']);
    expect(map.get('a.json')).toBe('{"title":"Crème — 5e"}\n');
    expect(map.has('gone.json')).toBe(false);
    expect(map.get('sub/b.json')).toBe('{"ok":true}');
  });

  it('touchedPages maps page-specific files and falls back to core smoke pages on shared edits', () => {
    const existing = [
      'index',
      'spells',
      'items',
      'bestiary',
      'classes',
      'races',
      'feats',
    ];
    expect(
      touchedPages(
        [
          'js/races.js',
          'node/generate-pages/template/page/page-feats.hbs',
          'README.md',
        ],
        existing,
      ),
    ).toEqual(['feats', 'races']);

    expect(touchedPages(['scss/main.scss', 'js/feats.js'], existing)).toEqual([
      'bestiary',
      'classes',
      'feats',
      'index',
      'items',
      'spells',
    ]);
  });

  it('loadSchemasAtRef reads nested schemas in one batch and populates show() cache', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hbm-batch-'));
    try {
      const g = (...args: string[]) =>
        execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
      g('init', '-b', 'main');
      g('config', 'user.email', 't@t');
      g('config', 'user.name', 't');
      fs.mkdirSync(path.join(dir, 'schema', 'sub'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'schema', 'root.json'),
        '{"type":"object","title":"Ångström"}',
      );
      fs.writeFileSync(
        path.join(dir, 'schema', 'sub', 'child.json'),
        '{"enum":["A","B"]}',
      );
      fs.writeFileSync(path.join(dir, 'schema', 'broken.json'), '{not json');
      fs.writeFileSync(path.join(dir, 'schema', 'README.md'), '# ignore');
      g('add', '-A');
      g('commit', '-m', 'init');

      clearShowCache();
      const bad: string[] = [];
      const { schemas, badJson } = loadSchemasAtRef(dir, 'HEAD', 'schema', (k) =>
        bad.push(k),
      );
      expect(badJson).toBe(1);
      expect(bad).toEqual(['broken.json']);
      expect(schemas['root.json']).toEqual({
        type: 'object',
        title: 'Ångström',
      });
      expect(schemas['sub/child.json']).toEqual({ enum: ['A', 'B'] });
      // Deleting the .git dir proves show() serves the cached entry without spawning git.
      fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
      expect(show(dir, 'HEAD', 'schema/sub/child.json')).toBe(
        '{"enum":["A","B"]}',
      );
    } finally {
      clearShowCache();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('temp-folder git checks', () => {
  const at = (text: string) => (file: string) =>
    file === 'page.hbs' ? text : null;

  it('patchApplies passes on the version the patch was built on', () => {
    expect(patchApplies(RESKIN, at(TEMPLATE))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('patchApplies fails, as a plain git apply would, once upstream rewrites the context', () => {
    const res = patchApplies(RESKIN, at(UPSTREAM_NEXT));
    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('page.hbs');
  });

  it('mergeConflicts finds none where a three-way merge can combine both edits', () => {
    const ours = TEMPLATE.replace(
      've-italic">Input',
      've-italic control-title">Input',
    );
    expect(mergeConflicts(ours, TEMPLATE, UPSTREAM_NEXT)).toBe(0);
  });

  it('mergeConflicts counts lines both sides rewrote', () => {
    const ours = TEMPLATE.replace('ve-btn-xs"', 've-btn-xs control-bar"');
    expect(mergeConflicts(ours, TEMPLATE, UPSTREAM_NEXT)).toBe(1);
  });
});

// items-shared.json's itemMiscTags before and after 5etools-utils 0.17.36.
const MISC = (values: string[]) => ({
  $defs: { itemMiscTags: { type: 'array', items: { enum: values } } },
});
const BEFORE = { 'items-shared.json': MISC(['CF/W', 'CNS', 'TT']) };
const AFTER = {
  'items-shared.json': MISC(['CF/W', 'CNS', 'DRK', 'FOD', 'TT']),
};

describe('schema enums against the guides', () => {
  it('schemaEnums finds string enums by pointer', () => {
    expect(schemaEnums(AFTER['items-shared.json'])).toEqual(
      new Map([
        ['/$defs/itemMiscTags/items', ['CF/W', 'CNS', 'DRK', 'FOD', 'TT']],
      ]),
    );
  });

  it('enumChanges reports added and removed values, and skips enums that are new', () => {
    const after = { ...AFTER, 'new.json': MISC(['X']) };
    expect(enumChanges(BEFORE, after)).toEqual([
      {
        file: 'items-shared.json',
        pointer: '/$defs/itemMiscTags/items',
        added: ['DRK', 'FOD'],
        removed: [],
        kept: ['CF/W', 'CNS', 'TT'],
      },
    ]);
  });

  it('staleLists flags a hand-typed list missing the new values', () => {
    const guide = [
      '# Items',
      'Utility tags for filtering. E.g. <code>"CNS"</code> (consumable), <code>"CF/W"</code> (creates food/water), <code>"TT"</code> (trinket table).',
    ].join('\n');
    const [hit, ...rest] = staleLists(enumChanges(BEFORE, AFTER), {
      'item-conversion.md': guide,
    });
    expect(rest).toEqual([]);
    expect(hit).toMatchObject({
      guide: 'item-conversion.md',
      line: 2,
      missing: ['DRK', 'FOD'],
    });
  });

  it('staleLists ignores generated lists, lines naming one value, and complete lists', () => {
    const guide = [
      '<span class="schema-enum" data-enum="itemMiscTags"><code>"CNS"</code> · <code>"TT"</code></span>',
      'Set `"CNS"` on potions.',
      '`"CF/W"`, `"CNS"`, `"DRK"`, `"FOD"`, `"TT"`',
    ].join('\n');
    expect(
      staleLists(enumChanges(BEFORE, AFTER), { 'item-conversion.md': guide }),
    ).toEqual([]);
  });

  it('staleLists flags a list that still names a removed value', () => {
    const changes = enumChanges(AFTER, BEFORE);
    const hits = staleLists(changes, { g: '`"CNS"`, `"TT"`, `"FOD"`' });
    expect(hits).toMatchObject([
      { line: 1, missing: [], stillListed: ['FOD'] },
    ]);
  });
});

describe('styling', () => {
  it('newComponentClasses lists block__part classes a diff adds, not utilities or moved ones', () => {
    const diff = [
      '--- a/js/utils-brew/utils-brew-ui-get.js',
      '+++ b/js/utils-brew/utils-brew-ui-get.js',
      '+<div class="ve-w-100 ve-bb-1p manbrew-get-preview__sep-page"></div>',
      '-<div class="ve-flex lst__row"></div>',
      '+<div class="ve-flex-col lst__row"></div>',
    ].join('\n');
    expect(newComponentClasses(diff)).toEqual([
      'manbrew-get-preview__sep-page',
    ]);
  });
});

describe('module sources', () => {
  const ctx = {
    moduleDir: path.join('/app', 'deploy-modules', 'reskin'),
    dataDir: path.join('/data'),
    managerDir: path.join('/manager'),
    values: {
      package: '{manager}/customizer/patch-deploy',
      bare: 'relative/folder',
    },
  };

  it('resolves {option:…} through {manager} the way Prepare does', () => {
    expect(resolveModuleSource('{option:package}/reskin.patch', ctx)).toBe(
      path.join('/manager', 'customizer', 'patch-deploy', 'reskin.patch'),
    );
  });

  it('refuses an option that is a bare relative path or unset', () => {
    expect(resolveModuleSource('{option:bare}/x', ctx)).toBeNull();
    expect(resolveModuleSource('{option:missing}/x', ctx)).toBeNull();
  });

  it('resolves {data} and module-relative paths', () => {
    expect(resolveModuleSource('{data}/fonts', ctx)).toBe(
      path.join('/data', 'fonts'),
    );
    expect(resolveModuleSource('site.css', ctx)).toBe(
      path.join(ctx.moduleDir, 'site.css'),
    );
  });
});
