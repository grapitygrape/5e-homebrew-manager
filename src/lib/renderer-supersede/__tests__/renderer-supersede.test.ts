import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLS_BANNER,
  getNameBarTrHtml,
  getNoun,
  getSupersedesHtml,
  isBarShown,
  isShowOriginal,
  joinList,
  SESSION_KEY,
} from '../banner.js';
import {
  buildGraph,
  FILTER_OVERRIDDEN,
  FILTER_REPLACED,
  getFilterValues,
  getReplacements,
  getStackedSiblings,
} from '../graph.js';
import { tryOr } from '../guard.js';
import {
  getRedirectedHoverOpts,
  isRedundantMarker,
  mutTagMeta,
  RE_MARKER,
  RE_MARKER_GLUE,
  RE_TAG,
} from '../hooks.js';

const BUNDLE_PATH = join(
  process.cwd(),
  'deploy-modules/content-replacement/renderer-supersede.js',
);

function install5etoolsGlobals() {
  const g = globalThis as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const setGlobal = (key: string, val: unknown) => {
    saved[key] = g[key];
    g[key] = val;
  };

  setGlobal('MiscUtil', {
    set: (obj: Record<string, Record<string, unknown>>, k1: string, k2: string, val: unknown) => {
      (obj[k1] ||= {})[k2] = val;
    },
    getOrSet: (
      obj: Record<string, Record<string, unknown>>,
      k1: string,
      k2: string,
      val: unknown,
    ) => {
      obj[k1] ||= {};
      return (obj[k1][k2] ||= val);
    },
  });

  setGlobal('Parser', {
    getPropTag: (prop: string) => prop,
    sourceJsonToAbv: (s: string) => s,
    sourceJsonToFull: (s: string) => `Full ${s}`,
  });

  const hashOf = (ent: { name: string; source: string }) =>
    `${ent.name.toLowerCase().replace(/\s+/g, '%20')}_${ent.source.toLowerCase()}`;

  setGlobal('UrlUtil', {
    URL_TO_HASH_BUILDER: {
      spell: hashOf,
      'spells.html': hashOf,
      item: hashOf,
      'items.html': hashOf,
    },
    PROP_TO_PAGE: {
      spell: 'spells.html',
      item: 'items.html',
      monster: 'bestiary.html',
    },
    autoDecodeHash: (hash: string) => {
      const [name, source] = hash.split('_');
      return { name: decodeURIComponent(name), source };
    },
    getCurrentPage: () => 'spells.html',
  });

  setGlobal('DataUtil', {
    proxy: {
      unpackUid: (_prop: string, uid: string) => {
        const [name, source] = uid.split('|');
        if (!name || !source) throw new Error('bad uid');
        return { name, source };
      },
    },
  });

  // 5etools extends String.prototype with qq() and toTitleCase()
  const origQq = (String.prototype as unknown as Record<string, unknown>).qq;
  const origTitle = (String.prototype as unknown as Record<string, unknown>).toTitleCase;
  (String.prototype as unknown as Record<string, unknown>).qq = function (this: string) {
    return this.replace(/"/g, '&quot;');
  };
  (String.prototype as unknown as Record<string, unknown>).toTitleCase = function (this: string) {
    return this.replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return () => {
    for (const [key, val] of Object.entries(saved)) {
      if (val === undefined) delete g[key];
      else g[key] = val;
    }
    if (origQq === undefined) delete (String.prototype as unknown as Record<string, unknown>).qq;
    else (String.prototype as unknown as Record<string, unknown>).qq = origQq;
    if (origTitle === undefined) {
      delete (String.prototype as unknown as Record<string, unknown>).toTitleCase;
    } else {
      (String.prototype as unknown as Record<string, unknown>).toTitleCase = origTitle;
    }
  };
}

describe('renderer-supersede guard', () => {
  const g = globalThis as Record<string, unknown>;
  const origJqueryUtil = g.JqueryUtil;

  afterEach(() => {
    if (origJqueryUtil === undefined) delete g.JqueryUtil;
    else g.JqueryUtil = origJqueryUtil;
    vi.restoreAllMocks();
  });

  it('returns fallback on throw, logs once per label, and toasts once per page', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const doToast = vi.fn();
    g.JqueryUtil = { doToast };

    const failed = new Set<string>();
    const boom = () => {
      throw new Error('boom');
    };

    expect(tryOr(failed, 'ok', () => 42, () => 0)).toBe(42);
    expect(tryOr(failed, 'hookA', boom, () => 'fallbackA1')).toBe('fallbackA1');
    expect(tryOr(failed, 'hookA', boom, () => 'fallbackA2')).toBe('fallbackA2');
    expect(tryOr(failed, 'hookB', boom, () => 'fallbackB')).toBe('fallbackB');

    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(doToast).toHaveBeenCalledTimes(1);
    expect([...failed]).toEqual(['hookA', 'hookB']);
  });
});

describe('renderer-supersede graph', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = install5etoolsGlobals();
  });

  afterEach(() => {
    restore();
  });

  it('resolves chains, drops cycles & self-links, and tracks reverse & override sets', () => {
    const { fwd, rev, overridden, problems } = buildGraph([
      {
        page: 'spells.html',
        hash: 'fireball_phb',
        prop: 'spell',
        displayName: 'Fireball',
        source: 'PHB',
        override: 'PHB->STDS',
        replacedBy: { uid: 'Fireball|XPHB' },
      },
      {
        page: 'spells.html',
        hash: 'fireball_xphb',
        prop: 'spell',
        displayName: 'Fireball',
        source: 'XPHB',
        replacedBy: { uid: 'Fireball|STDS' },
      },
      // Cycle A -> B -> A
      {
        page: 'spells.html',
        hash: 'alpha_phb',
        prop: 'spell',
        replacedBy: { uid: 'Beta|PHB' },
      },
      {
        page: 'spells.html',
        hash: 'beta_phb',
        prop: 'spell',
        replacedBy: { uid: 'Alpha|PHB' },
      },
      // Self replacement
      {
        page: 'spells.html',
        hash: 'self_phb',
        prop: 'spell',
        replacedBy: { uid: 'Self|PHB' },
      },
    ]);

    expect(fwd['spells.html']?.['fireball_phb']?.[0]?.hash).toBe('fireball_stds');
    expect(fwd['spells.html']?.['alpha_phb']).toBeUndefined();
    expect(fwd['spells.html']?.['beta_phb']).toBeUndefined();
    expect(fwd['spells.html']?.['self_phb']).toBeUndefined();

    expect(rev['spells.html']?.['fireball_stds']).toEqual([
      { page: 'spells.html', hash: 'fireball_phb', name: 'Fireball', source: 'PHB' },
      { page: 'spells.html', hash: 'fireball_xphb', name: 'Fireball', source: 'XPHB' },
    ]);

    expect(overridden.has('spells.html|fireball_phb')).toBe(true);
    expect(overridden.has('spells.html|fireball_xphb')).toBe(false);
    expect(problems.some((p) => p.includes('supersession cycle'))).toBe(true);
    expect(problems.some((p) => p.includes('replaced by itself'))).toBe(true);

    const api = {
      _fwd: fwd,
      _overridden: overridden,
      _FILTER_OVERRIDDEN: FILTER_OVERRIDDEN,
      _FILTER_REPLACED: FILTER_REPLACED,
    };
    expect(getFilterValues(api, { page: 'spells.html', hash: 'fireball_phb' })).toEqual([
      'Overridden',
    ]);
    expect(getFilterValues(api, { page: 'spells.html', hash: 'fireball_xphb' })).toEqual([
      'Replaced',
    ]);
    expect(getFilterValues(api, { page: 'spells.html', hash: 'unmapped_phb' })).toEqual([]);
  });

  it('filters replacements by source availability and reports stacked siblings only on primary', () => {
    const { fwd, rev } = buildGraph([
      {
        page: 'spells.html',
        hash: 'split_phb',
        prop: 'spell',
        displayName: 'Split Spell',
        source: 'PHB',
        replacedBy: [{ uid: 'Part One|HB1' }, { uid: 'Part Two|HB1' }, { uid: 'Missing|UNLOADED' }],
      },
    ]);

    const api = {
      isInitialised: true,
      _fwd: fwd,
      _rev: rev,
      _isStacking: false,
      _isSourceAvailable: (src: string) => src === 'HB1',
      _getEntPageHash: (ent: { name: string; source: string }) => ({
        page: 'spells.html',
        hash: `${ent.name.toLowerCase().replace(/\s+/g, '%20')}_${ent.source.toLowerCase()}`,
      }),
      getReplacements(args: { page: string; hash: string }) {
        return getReplacements(this, args);
      },
    };

    const reps = getReplacements(api, { page: 'spells.html', hash: 'split_phb' });
    expect(reps.map((r) => r.name)).toEqual(['Part One', 'Part Two']);

    // Primary sees Part Two as sibling; secondary sees none.
    expect(
      getStackedSiblings(api, { name: 'Part One', source: 'HB1' }, { page: 'spells.html' }).map(
        (s) => s.name,
      ),
    ).toEqual(['Part Two']);
    expect(
      getStackedSiblings(api, { name: 'Part Two', source: 'HB1' }, { page: 'spells.html' }),
    ).toEqual([]);
  });
});

describe('renderer-supersede banner & hooks', () => {
  let restore: () => void;

  beforeEach(() => {
    restore = install5etoolsGlobals();
  });

  afterEach(() => {
    restore();
    delete (globalThis as Record<string, unknown>).sessionStorage;
  });

  it('selects nouns, joins lists, and tracks name-bar consumption', () => {
    expect(getNoun({ __prop: 'monster' }, 'bestiary.html')).toBe('creature');
    expect(getNoun({}, 'items.html')).toBe('item');
    expect(getNoun({}, 'unknown.html')).toBe('entry');

    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');

    const ent = { __prop: 'spell', name: 'Fireball', source: 'STDS' };
    const api = {
      isInitialised: true,
      _isStacking: false,
      _barShown: new WeakSet(),
      _CLS_BANNER: CLS_BANNER,
      _getEntPageHash: () => ({ page: 'spells.html', hash: 'fireball_stds' }),
      getSupersededBy: () => [
        { page: 'spells.html', hash: 'fireball_phb', name: 'Fireball', source: 'PHB' },
      ],
      _joinList: joinList,
      _getNoun: getNoun,
      getBarTrHtml: () => '<tr>bar</tr>',
    };

    expect(getNameBarTrHtml(api, ent, { isEmbeddedEntity: true })).toBe('');
    expect(
      getNameBarTrHtml(api, ent, { htmlControlRhs: '<button data-p-build-fluff-tab-replace>' }),
    ).toBe('');
    expect(getNameBarTrHtml(api, ent, {})).toBe('<tr>bar</tr>');
    expect(isBarShown(api, ent)).toBe(true);
    expect(isBarShown(api, ent)).toBe(false);

    const html = getSupersedesHtml(api, ent, { page: 'spells.html' });
    expect(html).toContain('onclick="return Renderer.supersede.handleShowOriginalClick(event, this)"');
    expect(html).toContain('is replaced by this spell.');
  });

  it('handles sessionStorage swap-back handoff once', () => {
    const store = new Map<string, string>([[SESSION_KEY, 'fireball_phb']]);
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    };
    const api = { _SESSION_KEY: SESSION_KEY, _showOriginalHash: null as string | null };

    expect(isShowOriginal(api, 'fireball_phb')).toBe(true);
    expect(store.has(SESSION_KEY)).toBe(false);
    expect(api._showOriginalHash).toBe('fireball_phb');
    expect(isShowOriginal(api, 'fireball_phb')).toBe(true);
    expect(isShowOriginal(api, 'other_phb')).toBe(false);
  });

  it('redirects tag meta & hover opts and detects redundant Replaces markers', () => {
    const replacement = {
      page: 'spells.html',
      hash: 'fireball_stds',
      name: 'Fireball',
      source: 'STDS',
    };
    const api = {
      isInitialised: true,
      _RE_MARKER: RE_MARKER,
      _RE_TAG: RE_TAG,
      _RE_MARKER_GLUE: RE_MARKER_GLUE,
      _fnGetTagMetaOrig: (_tag: string, text: string) => {
        const [name, src] = text.split('|');
        return { page: 'spells.html', hash: `${name.toLowerCase()}_${(src || 'phb').toLowerCase()}` };
      },
      getReplacement: ({ hash }: { page: string; hash: string }) =>
        hash === 'fireball_phb' ? replacement : null,
    };

    const meta = {
      page: 'spells.html',
      hash: 'fireball_phb',
      name: 'Fireball',
      source: 'PHB',
      hashHover: 'fireball_phb',
      sourceHover: 'PHB',
      pageHover: 'spells.html',
    };
    expect(mutTagMeta(api, meta)).toMatchObject({
      hash: 'fireball_stds',
      source: 'STDS',
      hashHover: 'fireball_stds',
      sourceHover: 'STDS',
    });

    // Preserves customHashId / preloadId
    const customHover = { page: 'spells.html', hash: 'fireball_phb', customHashId: 'scaled' };
    expect(getRedirectedHoverOpts(api, customHover)).toBe(customHover);
    expect(getRedirectedHoverOpts(api, { page: 'spells.html', hash: 'fireball_phb' })).toEqual({
      page: 'spells.html',
      hash: 'fireball_stds',
      source: 'STDS',
    });

    expect(isRedundantMarker(api, '{@b Replaces:} {@spell Fireball|PHB}')).toBe(true);
    expect(isRedundantMarker(api, '{@b Replaces:} {@spell Fireball|PHB} (in part)')).toBe(false);
    expect(isRedundantMarker(api, '{@b Replaces:} {@spell Shield|PHB}')).toBe(false);
  });
});

describe('renderer-supersede bundle VM smoke test', () => {
  it('loads cleanly in a 5etools-like VM, installs hooks, and redirects tags', async () => {
    const script = readFileSync(BUNDLE_PATH, 'utf8');
    const hashOf = (ent: { name: string; source: string }) =>
      `${ent.name.toLowerCase()}_${ent.source.toLowerCase()}`;

    const Renderer = {
      get: () => ({ baseUrl: '', render: (s: string) => s }),
      utils: {
        getTagMeta: (_tag: string, text: string) => {
          const [name, source] = text.split('|');
          const hash = `${name.toLowerCase()}_${source.toLowerCase()}`;
          return {
            name,
            source,
            hash,
            page: 'spells.html',
            hashHover: hash,
            sourceHover: source,
            pageHover: 'spells.html',
          };
        },
        getNameTr: () => '<tr>name</tr>',
        getPageTr: () => '<tr>page</tr>',
      },
      hover: {
        getFnRenderCompact: () => () => '<tr>compact</tr>',
        getHoverElementAttributes: (opts: Record<string, unknown>) => opts,
      },
      prototype: {
        _recursiveRender: () => 'rendered',
      },
      supersede: null as unknown as {
        pInit: () => Promise<void>;
        isInitialised: boolean;
        getReplacement: (a: { page: string; hash: string }) => { hash: string; source: string } | null;
      },
    };

    const sandbox: Record<string, unknown> = {
      console,
      Renderer,
      DataUtil: {
        loadJSON: async () => ({
          supersession: [
            {
              page: 'spells.html',
              hash: 'fireball_phb',
              prop: 'spell',
              displayName: 'Fireball',
              source: 'PHB',
              replacedBy: { uid: 'Fireball|STDS' },
            },
          ],
        }),
        proxy: {
          unpackUid: (_prop: string, uid: string) => {
            const [name, source] = uid.split('|');
            return { name, source };
          },
        },
      },
      MiscUtil: {
        set: (obj: Record<string, Record<string, unknown>>, k1: string, k2: string, val: unknown) => {
          (obj[k1] ||= {})[k2] = val;
        },
        getOrSet: (
          obj: Record<string, Record<string, unknown>>,
          k1: string,
          k2: string,
          val: unknown,
        ) => {
          obj[k1] ||= {};
          return (obj[k1][k2] ||= val);
        },
      },
      Parser: {
        getPropTag: (p: string) => p,
        sourceJsonToAbv: (s: string) => s,
        sourceJsonToFull: (s: string) => s,
      },
      UrlUtil: {
        URL_TO_HASH_BUILDER: { spell: hashOf, 'spells.html': hashOf },
        PROP_TO_PAGE: { spell: 'spells.html' },
        autoDecodeHash: (h: string) => ({ name: h, source: 'PHB' }),
        getCurrentPage: () => 'spells.html',
      },
      BrewUtil2: { hasSourceJson: (s: string) => s === 'STDS' },
      Hist: { hashChange: () => {}, getHashParts: () => [], replaceHistoryHash: () => {} },
      ListPage: { prototype: { pOnLoad: async () => {}, _addData: () => {} } },
      PageFilterBase: { prototype: { pInitFilterBox: async () => {}, mutateAndAddToFilters: () => {} } },
      FilterBox: { prototype: { _toDisplay: () => true } },
      Filter: class {},
    };
    sandbox.globalThis = sandbox;

    vm.runInNewContext(script, sandbox);
    await Renderer.supersede.pInit();

    expect(Renderer.supersede.isInitialised).toBe(true);
    expect(
      Renderer.supersede.getReplacement({ page: 'spells.html', hash: 'fireball_phb' }),
    ).toMatchObject({ hash: 'fireball_stds', source: 'STDS' });

    const redirected = Renderer.utils.getTagMeta('@spell', 'Fireball|PHB');
    expect(redirected.hash).toBe('fireball_stds');
    expect(redirected.source).toBe('STDS');
  });
});
