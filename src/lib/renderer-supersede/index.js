/**
 * Homebrew content supersession.
 *
 * Redirects superseded 5etools entities to their replacements across list pages,
 * tag links, hover popups, and omnisearch, and renders a replacement bar above
 * the name with a one-shot swap-back link to view the original.
 *
 * Spliced onto the end of `js/render.js` by the Content replacement deploy module.
 */

import {
  CLS_BANNER,
  CLS_BAR_ROW,
  CLS_EXTRAS,
  K_MUT,
  PROP_TO_NOUN,
  SESSION_KEY,
  STYLE_ID,
  getBarTrHtml,
  getExtrasHtml,
  getNameBarTrHtml,
  getNoun,
  getStackedTrHtml,
  getSupersededByHtml,
  getSupersedesHtml,
  handleShowOriginalClick,
  injectStyles,
  isBarShown,
  isShowOriginal,
  joinList,
  mutDecorateListItem,
} from './banner.js';
import {
  FILTER_HEADER,
  FILTER_OVERRIDDEN,
  FILTER_REPLACED,
  MAX_CHAIN,
  buildEdge,
  buildGraph,
  buildReverse,
  buildTarget,
  getEntPageHash,
  getFilterValues,
  getReplacements,
  getStackedSiblings,
  getSupersededBy,
  getTerminal,
  isSourceAvailable,
  resolveGraph,
  warmCache,
  warmOne,
} from './graph.js';
import { tryOr } from './guard.js';
import {
  RE_MARKER,
  RE_MARKER_GLUE,
  RE_TAG,
  decorateList,
  getRedirectedHoverOpts,
  installFilterHooks,
  installHooksEarly,
  installHooksLate,
  isRedundantMarker,
  mutRedirectLocationHash,
  mutTagMeta,
} from './hooks.js';

Renderer.supersede = class {
  static _URL = 'data/content-replacement.json';
  static _CLS_BANNER = CLS_BANNER;
  static _CLS_BAR_ROW = CLS_BAR_ROW;
  static _CLS_EXTRAS = CLS_EXTRAS;
  static _K_MUT = K_MUT;
  static _SESSION_KEY = SESSION_KEY;
  static _STYLE_ID = STYLE_ID;
  static _MAX_CHAIN = MAX_CHAIN;

  static _FILTER_HEADER = FILTER_HEADER;
  static _FILTER_OVERRIDDEN = FILTER_OVERRIDDEN;
  static _FILTER_REPLACED = FILTER_REPLACED;
  static _PROP_TO_NOUN = PROP_TO_NOUN;
  static _RE_MARKER = RE_MARKER;
  static _RE_TAG = RE_TAG;
  static _RE_MARKER_GLUE = RE_MARKER_GLUE;

  static isInitialised = false;
  static _fwd = {};
  static _rev = {};
  static _overridden = new Set();
  static _pInitialising = null;
  static _missingHooks = [];
  static _failedHooks = new Set();
  static _showOriginalHash = null;
  static _isStacking = false;
  static _barShown = new WeakSet();
  static _fnGetTagMetaOrig = null;

  static async pInit() {
    return (this._pInitialising ||= this._pInit_());
  }

  static _tryOr(label, fn, fnFallback) {
    return tryOr(this._failedHooks, label, fn, fnFallback);
  }

  static async _pInit_() {
    let json = null;
    try {
      json = await DataUtil.loadJSON(`${Renderer.get().baseUrl}${this._URL}`);
    } catch {
      // An absent file is the expected state on a tree with no mappings yet.
      json = null;
    }

    this._build(json?.supersession || []);
    this._installHooksLate();
    this.isInitialised = true;
    this._injectStyles();
    this._warmCache();
  }

  static _build(rows) {
    const { fwd, rev, overridden, problems } = buildGraph(rows, this._MAX_CHAIN);
    this._fwd = fwd;
    this._rev = rev;
    this._overridden = overridden;

    if (problems.length) {
      console.warn(`[supersede] ${problems.length} mapping(s) ignored:`, problems);
    }
  }

  static _build_getEdge(row, problems) {
    return buildEdge(row, problems);
  }

  static _build_getTarget(args) {
    return buildTarget(args);
  }

  static _build_getResolved(fwd, problems) {
    return resolveGraph(fwd, problems, this._MAX_CHAIN);
  }

  static _build_getResolved_getTerminal(args) {
    return getTerminal({ ...args, maxChain: this._MAX_CHAIN });
  }

  static _build_getReverse(fwd, origins) {
    return buildReverse(fwd, origins);
  }

  static _warmCache() {
    warmCache(this._fwd, (to) => this._warmOne(to));
  }

  static _warmOne(to) {
    warmOne(to);
  }

  static getReplacements(args) {
    return getReplacements(this, args);
  }

  static getReplacement(args) {
    return this.getReplacements(args)[0] || null;
  }

  static getStackedSiblings(ent, opts) {
    return getStackedSiblings(this, ent, opts);
  }

  static getSupersededBy(args) {
    return getSupersededBy(this, args);
  }

  static _isSourceAvailable(source) {
    return isSourceAvailable(source);
  }

  static _getEntPageHash(ent, opts) {
    return getEntPageHash(ent, opts);
  }

  static mutDecorateListItem(listItem, opts) {
    mutDecorateListItem(this, listItem, opts);
  }

  static _injectStyles() {
    injectStyles(this._STYLE_ID);
  }

  static mutTagMeta(tagMeta) {
    return mutTagMeta(this, tagMeta);
  }

  static getExtrasHtml(ent, opts) {
    return getExtrasHtml(this, ent, opts);
  }

  static getNameBarTrHtml(ent, opts) {
    return getNameBarTrHtml(this, ent, opts);
  }

  static isBarShown(ent) {
    return isBarShown(this, ent);
  }

  static getBarTrHtml(ent, opts) {
    return getBarTrHtml(this, ent, opts);
  }

  static getSupersededByHtml(ent, opts) {
    return getSupersededByHtml(this, ent, opts);
  }

  static getStackedTrHtml(ent, opts) {
    return getStackedTrHtml(this, ent, opts);
  }

  static getSupersedesHtml(ent, opts) {
    return getSupersedesHtml(this, ent, opts);
  }

  static _getNoun(ent, page) {
    return getNoun(ent, page);
  }

  static _joinList(pts) {
    return joinList(pts);
  }

  static handleShowOriginalClick(evt, ele) {
    return handleShowOriginalClick(this, evt, ele);
  }

  static _isShowOriginal(hash) {
    return isShowOriginal(this, hash);
  }

  static _installHooksEarly() {
    installHooksEarly(this);
  }

  static isRedundantMarker(str) {
    return isRedundantMarker(this, str);
  }

  static getRedirectedHoverOpts(opts) {
    return getRedirectedHoverOpts(this, opts);
  }

  static _installHooksLate() {
    installHooksLate(this);
  }

  static getFilterValues(args) {
    return getFilterValues(this, args);
  }

  static _installFilterHooks() {
    return installFilterHooks(this);
  }

  static _decorateList(listPage) {
    decorateList(this, listPage);
  }

  static _mutRedirectLocationHash() {
    mutRedirectLocationHash(this);
  }
};

Renderer.supersede._installHooksEarly();
if (typeof document !== 'undefined') {
  // A failed init leaves supersession off; report it rather than leave a bare rejection.
  const pInitReported = () =>
    Renderer.supersede.pInit().catch((e) =>
      Renderer.supersede._tryOr(
        'pInit',
        () => {
          throw e;
        },
        () => {},
      ),
    );
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pInitReported);
  } else {
    pInitReported();
  }
}
