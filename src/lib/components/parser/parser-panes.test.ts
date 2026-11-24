/**
 * The Parser's toolbar and outline, rendered server-side from a controller in
 * a parsed state - no editor mounted. Pins what each pane draws from the
 * controller: stats and actions in the header, the grouped object tree, and
 * schema plus link issues under the right object in the Errors data.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { BARE_SCHEMA, parseHomebrewFile } from '$lib/engine/audit';
import { ParserController } from '$lib/state/parser-controller.svelte';
import ParserToolbar from './ParserToolbar.svelte';
import OutlinePane from './OutlinePane.svelte';

function parsedController(): ParserController {
  const ctl = new ParserController({ file: 'Me; Brew.json', repo: '' });
  const doc = {
    _meta: { sources: [{ json: 'MeBrew' }] },
    spell: [
      { name: 'Alpha Bolt', source: 'MeBrew', page: 12 },
      { name: 'Beta Ray', source: 'MeBrew' },
    ],
    item: [{ name: 'Gamma Ring', source: 'MeBrew' }],
  };
  const parsed = parseHomebrewFile(doc, () => BARE_SCHEMA);
  parsed.nodes
    .find((n) => n.entity.name === 'Beta Ray')!
    .errors.push('<code>level</code>: Missing required property.');
  // As the controller's schema pass does after placing issues on nodes.
  parsed.totals = { ...parsed.totals, errors: 1, warnings: 0, clean: 2 };
  ctl.parsed = parsed;
  ctl.docRecord = doc;
  ctl.docText = JSON.stringify(doc);
  ctl.canSave = true;
  return ctl;
}

describe('ParserToolbar', () => {
  it('shows the open file, the totals and the save actions', () => {
    const body = render(ParserToolbar, {
      props: { ctl: parsedController() },
    }).body;
    expect(body).toContain('Me; Brew.json');
    expect(body).toContain('homebrew folder');
    expect(body).toMatch(/Objects <b[^>]*>3<\/b>/);
    expect(body).toMatch(/Errors <b[^>]*>1<\/b>/);
    expect(body).toContain('Save');
    expect(body).toContain('Deploy');
  });

  it('hides Save and Deploy for a file that cannot be saved', () => {
    const ctl = parsedController();
    ctl.canSave = false;
    const body = render(ParserToolbar, { props: { ctl } }).body;
    expect(body).not.toContain('Deploy');
  });
});

describe('OutlinePane', () => {
  it('groups objects by type with their labels, pages and badges', () => {
    const body = render(OutlinePane, {
      props: { ctl: parsedController() },
    }).body;
    for (const name of ['Alpha Bolt', 'Beta Ray', 'Gamma Ring'])
      expect(body).toContain(name);
    expect(body).toMatch(/spell<\/span><span[^>]*>2\s+objects/);
    expect(body).toContain('p12');
    // Beta Ray carries the error; the others are clean.
    expect(body.match(/class="row[^"]*has-error/g)?.length).toBe(1);
    expect(body.match(/class="b-ok/g)?.length).toBe(2);
  });

  it('counts schema and link issues together on the Errors tab badge', () => {
    const ctl = parsedController();
    const beta = ctl.parsed!.nodes.find((n) => n.entity.name === 'Beta Ray')!;
    ctl.linkIssues = new Map([
      [
        `${beta.type}:${beta.entityIdx}`,
        {
          type: beta.type,
          entityIdx: beta.entityIdx,
          errors: [],
          warnings: [
            {
              severity: 'warning',
              msg: '<code>entries</code>: unknown source',
              plain: 'unknown source',
              raw: '{@spell X|NOPE}',
              at: 'entries',
            },
          ],
        },
      ],
    ]);
    ctl.linkTotals = { brokenLinks: 0, linkWarnings: 1 };
    // Svelte's hydration comments sit between the badge and its number.
    const body = render(OutlinePane, { props: { ctl } }).body.replace(
      /<!--[\s\S]*?-->/g,
      '',
    );
    // 1 schema error + 1 link warning.
    expect(body).toMatch(/Errors\s*<span[^>]*tab-count[^>]*>\s*2\s*</);
  });

  it('shows the parse error instead of the tree', () => {
    const ctl = parsedController();
    ctl.parseError = 'Invalid JSON — Unexpected token';
    const body = render(OutlinePane, { props: { ctl } }).body;
    expect(body).toContain('Invalid JSON');
    expect(body).not.toContain('Alpha Bolt');
  });
});
