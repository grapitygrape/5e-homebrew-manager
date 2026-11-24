// UI banners, stacked sibling rows, list-row strike-through decoration, styles,
// and one-shot "show original" swap-back state.

export const CLS_BANNER = 'hm-supersede__banner';
export const CLS_BAR_ROW = 'hm-supersede__bar-row';
/** On every row we add below a render, so one that already carries them is not decorated twice. */
export const CLS_EXTRAS = 'hm-supersede__x';
export const K_MUT = '_hbmSupersedeMut';
export const SESSION_KEY = 'hm-supersede-show-original';
export const STYLE_ID = 'hm-supersede-styles';

/** Nouns for the bar; upstream's prop display names ("Item (Base)") don't read as one. */
export const PROP_TO_NOUN = {
  spell: 'spell',
  item: 'item',
  baseitem: 'item',
  magicvariant: 'item',
  monster: 'creature',
  race: 'species',
  subrace: 'species',
  feat: 'feat',
  background: 'background',
  optionalfeature: 'option',
  condition: 'condition',
  disease: 'disease',
  deity: 'deity',
  object: 'object',
  vehicle: 'vehicle',
  reward: 'reward',
  trap: 'trap',
  hazard: 'hazard',
  variantrule: 'rule',
  table: 'table',
};

// Opacity rather than an explicit colour: list cells set their own colours (source
// class, spell school), and this has to read as "muted" in both themes.
// The bar uses the reskin's tokens when it's deployed, with plain fallbacks for the
// stock site. Unlayered, so it beats upstream's @layer vetools cell padding.
export const SUPERSESSION_STYLES = `
.hm-supersede__lst-row { opacity: 0.55; }
.hm-supersede__lst-row:hover { opacity: 0.8; }
.hm-supersede__lst-name { text-decoration: line-through; }

/* Replacement bar */
:where(.hm-supersede__bar-row) > td { padding-block: var(--shell-space-3, 0.8rem) var(--shell-space-1, 0.2rem); }
:where(.hm-supersede__banner) {
	padding-block: var(--shell-space-2, 0.4rem);
	padding-inline: var(--shell-space-3, 0.8rem);
	border: 1px solid var(--shell-color-border, rgb(128 128 128 / 0.3));
	border-radius: var(--shell-radius-medium, 0.6rem);
	background: var(--shell-color-surface-raised, rgb(128 128 128 / 0.1));
	color: var(--shell-color-text-muted, inherit);
	font-size: var(--shell-font-size-small, 1.2rem);
}
:where(.hm-supersede__banner + .hm-supersede__banner) { margin-block-start: var(--shell-space-2, 0.4rem); }
`;

export const getNoun = (ent, page) => {
  if (PROP_TO_NOUN[ent?.__prop]) return PROP_TO_NOUN[ent.__prop];
  // Not every render path tags the entity; the first prop on its page will do.
  const prop = Object.keys(PROP_TO_NOUN).find((it) => UrlUtil.PROP_TO_PAGE?.[it] === page);
  return prop ? PROP_TO_NOUN[prop] : 'entry';
};

export const joinList = (pts) => {
  if (pts.length < 2) return pts.join('');
  return `${pts.slice(0, -1).join(', ')} and ${pts.at(-1)}`;
};

export const injectStyles = (styleId = STYLE_ID) => {
  if (typeof document === 'undefined' || document.getElementById(styleId)) return;

  const ele = document.createElement('style');
  ele.id = styleId;
  ele.textContent = SUPERSESSION_STYLES;
  document.head.appendChild(ele);
};

/**
 * Decorate a superseded entity's list row: muted, name struck through, and titled
 * with what replaced it.
 *
 * Deliberately NOT the native `reprintedAs`, which pushes "Reprinted" into `_fMisc`
 * (deselected by default), hiding the original from the list entirely.
 */
export const mutDecorateListItem = (api, listItem, { page } = {}) => {
  if (!api.isInitialised || !listItem?.ele || listItem.ele[api._K_MUT]) return;

  // Key off `data.hash`, not `ix` into `_dataList`: `ix` means different things on
  // different pages (items passes the hash itself for sublist rows), whereas
  // `data.hash` is what Hist.getActiveListItem relies on, so every page sets it.
  const hash = listItem.data?.hash;
  if (!hash) return;

  listItem.ele[api._K_MUT] = true;

  const tos = api._fwd[page || UrlUtil.getCurrentPage()]?.[hash];
  if (!tos?.length) return;

  listItem.ele.classList.add('hm-supersede__lst-row');

  const title = `Replaced by ${tos
    .map((to) => `${to.name}${to.source ? ` (${Parser.sourceJsonToAbv(to.source)})` : ''}`)
    .join(', ')}`;

  // The name is the first cell of the row's link on every list page; fall back to
  // the row so the tooltip is never simply lost.
  const eleName = listItem.ele.querySelector('a > span, a > div') || listItem.ele;
  eleName.classList.add('hm-supersede__lst-name');
  eleName.setAttribute('title', title);
};

/**
 * Everything this module appends below a render: the bar, if the name row didn't
 * already show it, then any sibling replacements stacked beneath.
 */
export const getExtrasHtml = (api, ent, { page, isBarShown = false } = {}) => {
  if (api._isStacking) return '';
  return `${isBarShown ? '' : api.getBarTrHtml(ent, { page, isBottom: true })}${api.getStackedTrHtml(ent, { page })}`;
};

/**
 * The bar above the name: "Replaces X" on a replacement, "Replaced by Y" on an
 * original reached through the swap-back. Skipped for embedded entities, for stacked
 * siblings, and for the fluff tab, which parses the name row as a single element.
 */
export const getNameBarTrHtml = (api, ent, opts = {}) => {
  if (api._isStacking || !ent || typeof ent !== 'object') return '';
  if (opts.isEmbeddedEntity) return '';
  if (
    typeof opts.htmlControlRhs === 'string' &&
    opts.htmlControlRhs.includes('data-p-build-fluff-tab-replace')
  ) {
    return '';
  }

  const html = api.getBarTrHtml(ent, { page: opts.page });
  if (html) api._barShown.add(ent);
  return html;
};

/** Consume the name row's mark, so the next render of the same entity starts clean. */
export const isBarShown = (api, ent) =>
  !!ent && typeof ent === 'object' && api._barShown.delete(ent);

export const getBarTrHtml = (api, ent, { page, isBottom = false } = {}) => {
  const html = `${api.getSupersedesHtml(ent, { page })}${api.getSupersededByHtml(ent, { page })}`;
  if (!html) return '';
  // Only a bottom row carries the extras class, which the compact hook reads as
  // "getPageTr already appended everything".
  return `<tr class="${api._CLS_BAR_ROW}"><td colspan="6"${isBottom ? ` class="${api._CLS_EXTRAS}"` : ''}>${html}</td></tr>`;
};

/**
 * The reciprocal banner, shown on a superseded original reached via swap-back.
 */
export const getSupersededByHtml = (api, ent, { page } = {}) => {
  if (!api.isInitialised || !ent) return '';

  const pageHash = api._getEntPageHash(ent, { page });
  if (!pageHash) return '';

  const tos = api.getReplacements(pageHash);
  if (!tos.length) return '';

  const pts = tos
    .map((to) => {
      const abv = to.source ? Parser.sourceJsonToAbv(to.source) : '';
      const title = to.source ? Parser.sourceJsonToFull(to.source).qq() : '';
      return `${Renderer.get().render(`{@${to.tag || 'spell'} ${to.uid}}`)}${abv ? ` <span class="ve-help-subtle" title="${title}">${abv}</span>` : ''}`;
    })
    .join('; ');

  return `<div class="${api._CLS_BANNER}">Replaced by ${pts}.</div>`;
};

/**
 * Render the sibling replacements inline, each under its own border row, so a
 * one-to-many split reads as a single stacked block.
 */
export const getStackedTrHtml = (api, ent, { page } = {}) => {
  const siblings = api.getStackedSiblings(ent, { page });
  if (!siblings.length) return '';

  api._isStacking = true;
  try {
    return siblings
      .map((sib) => {
        const loaded =
          typeof DataLoader === 'undefined'
            ? null
            : DataLoader.getFromCache(sib.page, sib.source, sib.hash);

        // Not cached yet: fetch it so a later render can stack it, and omit it
        // now rather than blocking a synchronous render on the network.
        if (!loaded) {
          api._warmOne(sib);
          return '';
        }

        const fnRender = Renderer.hover.getFnRenderCompact(sib.page);
        if (typeof fnRender !== 'function') return '';

        return `<tr><th class="ve-tbl-border ${api._CLS_EXTRAS}" colspan="6"></th></tr>${fnRender(loaded)}`;
      })
      .join('');
  } catch (e) {
    console.warn('[supersede] could not stack replacements', e);
    return '';
  } finally {
    api._isStacking = false;
  }
};

export const getSupersedesHtml = (api, ent, { page } = {}) => {
  if (!api.isInitialised || !ent) return '';

  const pageHash = api._getEntPageHash(ent, { page });
  if (!pageHash) return '';

  const originals = api.getSupersededBy(pageHash);
  if (!originals?.length) return '';

  const pts = originals.map((it) => {
    const abv = it.source ? Parser.sourceJsonToAbv(it.source) : '';
    const title = it.source ? Parser.sourceJsonToFull(it.source).qq() : '';
    return `<a href="${it.page}#${it.hash}" data-vet-supersede-hash="${it.hash.qq()}" data-vet-supersede-page="${it.page.qq()}" onclick="return Renderer.supersede.handleShowOriginalClick(event, this)">${it.name.qq()}</a>${abv ? ` <span class="ve-help-subtle" title="${title}">(${abv})</span>` : ''}`;
  });

  // "Absorb Elements (XGE) is replaced by this spell." The bare "Replaces X" read
  // as ambiguous about which way the replacement went.
  const verb = pts.length === 1 ? 'is' : 'are';
  return `<div class="${api._CLS_BANNER}">${api._joinList(pts)} ${verb} replaced by this ${api._getNoun(ent, pageHash.page)}.</div>`;
};

/**
 * Show the original this entity replaced. Suppression is one-shot and stored in
 * sessionStorage rather than memory so it survives cross-page hover navigations.
 */
export const handleShowOriginalClick = (api, evt, ele) => {
  const hash = ele.dataset.vetSupersedeHash;
  const page = ele.dataset.vetSupersedePage;
  if (!hash) return true;

  // Cross-page: the in-memory flag will not survive the navigation, so hand it over
  // in sessionStorage. Same-page: memory only, so the two never both fire and leave
  // a stale token behind.
  if (page && page !== UrlUtil.getCurrentPage()) {
    try {
      sessionStorage.setItem(api._SESSION_KEY, hash);
    } catch {
      // Private browsing; the swap-back degrades to a plain redirect.
    }
    return true;
  }

  api._showOriginalHash = hash;
  evt.preventDefault();
  Hist.cleanSetHash(hash);
  return false;
};

export const isShowOriginal = (api, hash) => {
  if (!hash) return false;
  // Sticky while the user stays put: filter changes rewrite the subhash and fire
  // another hashChange, which must not bounce them off the entity they asked for.
  if (api._showOriginalHash === hash) return true;

  try {
    if (sessionStorage.getItem(api._SESSION_KEY) === hash) {
      sessionStorage.removeItem(api._SESSION_KEY);
      api._showOriginalHash = hash;
      return true;
    }
  } catch {
    // Ignore; see handleShowOriginalClick.
  }

  return false;
};
