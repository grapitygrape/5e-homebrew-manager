// 5etools runtime hooks: tag/hover/compact/render early hooks, Hist/ListPage late
// hooks, and the Replacements filter hook on PageFilterBase / FilterBox.

import { warnMissingHooks } from './guard.js';

export const RE_MARKER = /^\s*\{@b\s+Replaces:?\}(.*)$/i;
export const RE_TAG = /\{@(\w+)\s+([^}]*)\}/g;
/** What may sit between a marker's tags: "A and B", "A, B.", and nothing else. */
export const RE_MARKER_GLUE = /^(?:[\s,;.&]|\band\b)*$/i;

/**
 * Redirect a rendered tag. Single seam covering both anchor href and hover popup:
 * `getTagMeta`'s output feeds `_renderLink_getHref` and `getHoverElementAttributes`.
 */
export const mutTagMeta = (api, tagMeta) => {
  if (!tagMeta || !api.isInitialised) return tagMeta;
  // Scaled spells/creatures and specific variants resolve against the original.
  if (tagMeta.preloadId || tagMeta.customHashId || tagMeta.subhashes?.length) return tagMeta;
  if (tagMeta.isFauxPage || !tagMeta.page || !tagMeta.hash) return tagMeta;

  const to = api.getReplacement({ page: tagMeta.page, hash: tagMeta.hash });
  if (!to) return tagMeta;

  const hashOld = tagMeta.hash;

  tagMeta.name = to.name;
  tagMeta.source = to.source;
  tagMeta.hash = to.hash;
  tagMeta.page = to.page;

  // Two-part tags carry a separate hover target; keep it aligned when it tracked
  // the primary, and leave it alone when it deliberately pointed elsewhere.
  if (tagMeta.hashHover === hashOld) {
    tagMeta.hashHover = to.hash;
    tagMeta.sourceHover = to.source;
    tagMeta.pageHover = to.page;
  }

  return tagMeta;
};

/**
 * Is this a homebrew "{@b Replaces:} {@spell X|PHB}" line that the banner already
 * covers? Anything else in the line ("(in part)", "(with Minor Drain)") stays.
 */
export const isRedundantMarker = (api, str) => {
  if (!api.isInitialised || !api._fnGetTagMetaOrig) return false;

  const m = api._RE_MARKER.exec(str);
  if (!m) return false;

  const tags = [...m[1].matchAll(api._RE_TAG)];
  if (!tags.length) return false;
  if (!api._RE_MARKER_GLUE.test(m[1].replace(api._RE_TAG, ''))) return false;

  return tags.every(([, tag, text]) => {
    let meta;
    try {
      meta = api._fnGetTagMetaOrig(`@${tag}`, text);
    } catch {
      return false;
    }
    return !!(meta?.page && meta?.hash && api.getReplacement({ page: meta.page, hash: meta.hash }));
  });
};

export const getRedirectedHoverOpts = (api, opts) => {
  if (!opts || !api.isInitialised) return opts;
  if (opts.preloadId || opts.customHashId || opts.isFauxPage) return opts;

  const to = api.getReplacement({ page: opts.page, hash: opts.hash });
  if (!to) return opts;

  return { ...opts, page: to.page, source: to.source, hash: to.hash };
};

export const decorateList = (api, listPage) => {
  if (!api.isInitialised) return;

  try {
    const page = UrlUtil.getCurrentPage();
    for (const list of listPage.primaryLists || []) {
      for (const listItem of list.items || []) api.mutDecorateListItem(listItem, { page });
    }
  } catch (e) {
    console.warn('[supersede] could not decorate list rows', e);
  }
};

/**
 * Rewrite the location hash before Hist reads it. `replaceHistoryHash` does not fire
 * a hashchange, so Back leaves the page instead of bouncing between the two entities.
 */
export const mutRedirectLocationHash = (api) => {
  if (!api.isInitialised) return;

  const [link, ...sub] = Hist.getHashParts();
  if (!link || link === HASH_BLANK) return;

  // Navigating to a different entity ends the reprieve, so coming back later
  // redirects again.
  if (api._showOriginalHash && api._showOriginalHash !== link) api._showOriginalHash = null;
  if (api._isShowOriginal(link)) return;

  const page = UrlUtil.getCurrentPage();
  const to = api.getReplacement({ page, hash: link });
  // Cross-page mappings cannot be resolved by a hash swap; the tag hook handles
  // those, and the list page would have nothing to select.
  if (!to || to.page !== page) return;

  Hist.replaceHistoryHash([to.hash, ...sub].join(HASH_PART_SEP));
};

export const installHooksEarly = (api) => {
  const missing = [];

  // Redirect every rendered tag: href, hover target and link text together.
  if (typeof Renderer?.utils?.getTagMeta === 'function') {
    const fnOrig = Renderer.utils.getTagMeta;
    // Unredirected, so a "Replaces:" marker can be checked against what it names.
    api._fnGetTagMetaOrig = fnOrig;
    Renderer.utils.getTagMeta = function (...args) {
      const meta = fnOrig.apply(this, args);
      return Renderer.supersede._tryOr(
        'getTagMeta',
        () => Renderer.supersede.mutTagMeta(meta),
        () => meta,
      );
    };
  } else missing.push('Renderer.utils.getTagMeta');

  // The name row, so the bar sits under the card's controls and above the name.
  if (typeof Renderer?.utils?.getNameTr === 'function') {
    const fnOrig = Renderer.utils.getNameTr;
    Renderer.utils.getNameTr = function (ent, opts, ...rest) {
      const html = fnOrig.call(this, ent, opts, ...rest);
      return `${Renderer.supersede._tryOr(
        'getNameTr',
        () => Renderer.supersede.getNameBarTrHtml(ent, opts || {}),
        () => '',
      )}${html}`;
    };
  } else missing.push('Renderer.utils.getNameTr');

  // Last row of a full statblock, so stacked siblings sit beneath the replacement.
  if (typeof Renderer?.utils?.getPageTr === 'function') {
    const fnOrig = Renderer.utils.getPageTr;
    Renderer.utils.getPageTr = function (ent, ...rest) {
      const html = fnOrig.call(this, ent, ...rest);
      return `${html}${Renderer.supersede._tryOr(
        'getPageTr',
        () =>
          Renderer.supersede.getExtrasHtml(ent, {
            isBarShown: Renderer.supersede.isBarShown(ent),
          }),
        () => '',
      )}`;
    };
  } else missing.push('Renderer.utils.getPageTr');

  // Compact renders (hover popups, DM screen, book view) have no source row.
  if (typeof Renderer?.hover?.getFnRenderCompact === 'function') {
    const fnOrig = Renderer.hover.getFnRenderCompact;
    Renderer.hover.getFnRenderCompact = function (page, ...rest) {
      const fn = fnOrig.call(this, page, ...rest);
      if (typeof fn !== 'function' || (typeof page === 'string' && page.endsWith('Fluff'))) {
        return fn;
      }

      return (ent, ...args) => {
        const html = fn(ent, ...args);
        const barAlreadyShown = Renderer.supersede.isBarShown(ent);
        // Some compact renderers route through getPageTr, which has already added it.
        if (typeof html !== 'string' || html.includes(Renderer.supersede._CLS_EXTRAS)) return html;
        return `${html}${Renderer.supersede._tryOr(
          'getFnRenderCompact',
          () =>
            Renderer.supersede.getExtrasHtml(ent, {
              page,
              isBarShown: barAlreadyShown || html.includes(Renderer.supersede._CLS_BAR_ROW),
            }),
          () => '',
        )}`;
      };
    };
  } else missing.push('Renderer.hover.getFnRenderCompact');

  // Omnisearch builds previews straight from the index doc, never through getTagMeta.
  if (typeof Renderer?.hover?.getHoverElementAttributes === 'function') {
    const fnOrig = Renderer.hover.getHoverElementAttributes;
    Renderer.hover.getHoverElementAttributes = function (opts) {
      return fnOrig.call(
        this,
        Renderer.supersede._tryOr(
          'getHoverElementAttributes',
          () => Renderer.supersede.getRedirectedHoverOpts(opts),
          () => opts,
        ),
      );
    };
  } else missing.push('Renderer.hover.getHoverElementAttributes');

  // Drop a "Replaces:" line the banner already says (here, so its <p> wrapper goes too).
  if (typeof Renderer?.prototype?._recursiveRender === 'function') {
    const fnOrig = Renderer.prototype._recursiveRender;
    Renderer.prototype._recursiveRender = function (entry, ...rest) {
      if (
        typeof entry === 'string' &&
        entry.includes('Replaces') &&
        Renderer.supersede._tryOr(
          '_recursiveRender',
          () => Renderer.supersede.isRedundantMarker(entry),
          () => false,
        )
      ) {
        return;
      }
      return fnOrig.call(this, entry, ...rest);
    };
  } else missing.push('Renderer.prototype._recursiveRender');

  api._missingHooks = missing;
};

/**
 * Add a "Replacements" filter to every list page, via the base class they all share.
 * Evaluated separately from FilterBox's positional pass so custom combine mode never
 * throws on a count mismatch.
 */
export const installFilterHooks = (api) => {
  const Base = globalThis.PageFilterBase;
  const Box = globalThis.FilterBox;
  const FilterCls = globalThis.Filter;
  if (!Base?.prototype?.pInitFilterBox || !Box?.prototype?._toDisplay || !FilterCls) {
    return ['PageFilterBase.pInitFilterBox / FilterBox._toDisplay / Filter'];
  }
  if (Base.prototype._hbmSupersedeHooked) return [];
  Base.prototype._hbmSupersedeHooked = true;

  const K_FILTER = '_hbmSupersedeFilter';
  const K_VALUES = '_fHbmSupersede';
  const wrapped = new WeakSet();

  // A subclass, not the base, owns `toDisplay` — possibly an ancestor of the page's own
  // class. Wrap whichever prototype actually defines it, the first time one inits.
  const wrapToDisplay = (Cls) => {
    let proto = Cls.prototype;
    while (
      proto &&
      proto !== Base.prototype &&
      !Object.prototype.hasOwnProperty.call(proto, 'toDisplay')
    ) {
      proto = Object.getPrototypeOf(proto);
    }
    if (!proto || proto === Base.prototype || wrapped.has(proto)) return;
    wrapped.add(proto);
    const fnOrig = proto.toDisplay;
    proto.toDisplay = function (values, entity, ...rest) {
      const f = this[K_FILTER];
      if (
        f &&
        !api._tryOr(
          'Replacements filter',
          () => f.toDisplay(values, entity?.[K_VALUES] || []),
          () => true,
        )
      ) {
        return false;
      }
      return fnOrig.call(this, values, entity, ...rest);
    };
  };

  const fnInitOrig = Base.prototype.pInitFilterBox;
  Base.prototype.pInitFilterBox = async function (opts = {}) {
    const filter = api._tryOr(
      'Replacements filter',
      () => {
        this[K_FILTER] ||= new FilterCls({
          header: api._FILTER_HEADER,
          items: [api._FILTER_OVERRIDDEN, api._FILTER_REPLACED],
          deselFn: (it) => it === api._FILTER_OVERRIDDEN,
        });
        this[K_FILTER]._isHbmSupersede = true;
        wrapToDisplay(this.constructor);
        return this[K_FILTER];
      },
      () => {
        delete this[K_FILTER];
        return null;
      },
    );
    // No filter of ours: the stock filter box, unchanged.
    if (!filter) return fnInitOrig.call(this, opts);

    const fnPopulate = this._pPopulateBoxOptions;
    this._pPopulateBoxOptions = async function (o) {
      await fnPopulate.call(this, o);
      if (Array.isArray(o.filters) && !o.filters.includes(filter)) o.filters.push(filter);
    };
    try {
      return await fnInitOrig.call(this, opts);
    } finally {
      delete this._pPopulateBoxOptions;
    }
  };

  const fnMutOrig = Base.prototype.mutateAndAddToFilters;
  Base.prototype.mutateAndAddToFilters = function (entity, ...rest) {
    const out = fnMutOrig.call(this, entity, ...rest);
    if (entity && typeof entity === 'object') {
      entity[K_VALUES] = api._tryOr(
        'Replacements filter values',
        () => {
          const ph = api._getEntPageHash(entity, { page: UrlUtil.getCurrentPage() });
          return ph ? api.getFilterValues(ph) : [];
        },
        () => [],
      );
    }
    return out;
  };

  const fnBoxOrig = Box.prototype._toDisplay;
  Box.prototype._toDisplay = function (boxState, filters, entryVals) {
    if (filters?.some?.((f) => f?._isHbmSupersede)) {
      filters = filters.filter((f) => !f?._isHbmSupersede);
    }
    return fnBoxOrig.call(this, boxState, filters, entryVals);
  };

  return [];
};

/** `Hist` and `ListPage` load after `js/render.js`; hook them once everything is parsed. */
export const installHooksLate = (api) => {
  const missing = [...(api._missingHooks || [])];

  if (typeof Hist !== 'undefined' && typeof Hist.hashChange === 'function') {
    const fnOrig = Hist.hashChange;
    Hist.hashChange = function (...args) {
      Renderer.supersede._tryOr(
        'Hist.hashChange',
        () => Renderer.supersede._mutRedirectLocationHash(),
        () => {},
      );
      return fnOrig.apply(this, args);
    };
  } else missing.push('Hist.hashChange');

  if (typeof ListPage !== 'undefined') {
    if (typeof ListPage.prototype.pOnLoad === 'function') {
      const fnOrig = ListPage.prototype.pOnLoad;
      ListPage.prototype.pOnLoad = async function (...args) {
        // A failed init leaves supersession off; the page itself must still load.
        try {
          await Renderer.supersede.pInit();
        } catch (e) {
          Renderer.supersede._tryOr(
            'pInit',
            () => {
              throw e;
            },
            () => {},
          );
        }
        return fnOrig.apply(this, args);
      };
    } else missing.push('ListPage.prototype.pOnLoad');

    // Runs after, not before: rows have to exist to be decorated. Multi-source
    // pages call this repeatedly, so decoration is marked per element.
    if (typeof ListPage.prototype._addData === 'function') {
      const fnOrig = ListPage.prototype._addData;
      ListPage.prototype._addData = function (data) {
        const out = fnOrig.call(this, data);
        Renderer.supersede._decorateList(this);
        return out;
      };
    } else missing.push('ListPage.prototype._addData');
  } else missing.push('ListPage');

  missing.push(...api._installFilterHooks());
  warnMissingHooks(missing);
};
