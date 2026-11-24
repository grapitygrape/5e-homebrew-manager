// GENERATED — do not edit directly; edit src/lib/renderer-supersede/ and run: npm run scripts:bundle
(function() {


//#region src/lib/renderer-supersede/banner.js
	const CLS_BANNER = "hm-supersede__banner";
	const CLS_BAR_ROW = "hm-supersede__bar-row";
	/** On every row we add below a render, so one that already carries them is not decorated twice. */
	const CLS_EXTRAS = "hm-supersede__x";
	const K_MUT = "_hbmSupersedeMut";
	const SESSION_KEY = "hm-supersede-show-original";
	const STYLE_ID = "hm-supersede-styles";
	/** Nouns for the bar; upstream's prop display names ("Item (Base)") don't read as one. */
	const PROP_TO_NOUN = {
		spell: "spell",
		item: "item",
		baseitem: "item",
		magicvariant: "item",
		monster: "creature",
		race: "species",
		subrace: "species",
		feat: "feat",
		background: "background",
		optionalfeature: "option",
		condition: "condition",
		disease: "disease",
		deity: "deity",
		object: "object",
		vehicle: "vehicle",
		reward: "reward",
		trap: "trap",
		hazard: "hazard",
		variantrule: "rule",
		table: "table"
	};
	const SUPERSESSION_STYLES = `
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
	const getNoun = (ent, page) => {
		if (PROP_TO_NOUN[ent?.__prop]) return PROP_TO_NOUN[ent.__prop];
		const prop = Object.keys(PROP_TO_NOUN).find((it) => UrlUtil.PROP_TO_PAGE?.[it] === page);
		return prop ? PROP_TO_NOUN[prop] : "entry";
	};
	const joinList = (pts) => {
		if (pts.length < 2) return pts.join("");
		return `${pts.slice(0, -1).join(", ")} and ${pts.at(-1)}`;
	};
	const injectStyles = (styleId = STYLE_ID) => {
		if (typeof document === "undefined" || document.getElementById(styleId)) return;
		const ele = document.createElement("style");
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
	const mutDecorateListItem = (api, listItem, { page } = {}) => {
		if (!api.isInitialised || !listItem?.ele || listItem.ele[api._K_MUT]) return;
		const hash = listItem.data?.hash;
		if (!hash) return;
		listItem.ele[api._K_MUT] = true;
		const tos = api._fwd[page || UrlUtil.getCurrentPage()]?.[hash];
		if (!tos?.length) return;
		listItem.ele.classList.add("hm-supersede__lst-row");
		const title = `Replaced by ${tos.map((to) => `${to.name}${to.source ? ` (${Parser.sourceJsonToAbv(to.source)})` : ""}`).join(", ")}`;
		const eleName = listItem.ele.querySelector("a > span, a > div") || listItem.ele;
		eleName.classList.add("hm-supersede__lst-name");
		eleName.setAttribute("title", title);
	};
	/**
	* Everything this module appends below a render: the bar, if the name row didn't
	* already show it, then any sibling replacements stacked beneath.
	*/
	const getExtrasHtml = (api, ent, { page, isBarShown = false } = {}) => {
		if (api._isStacking) return "";
		return `${isBarShown ? "" : api.getBarTrHtml(ent, {
			page,
			isBottom: true
		})}${api.getStackedTrHtml(ent, { page })}`;
	};
	/**
	* The bar above the name: "Replaces X" on a replacement, "Replaced by Y" on an
	* original reached through the swap-back. Skipped for embedded entities, for stacked
	* siblings, and for the fluff tab, which parses the name row as a single element.
	*/
	const getNameBarTrHtml = (api, ent, opts = {}) => {
		if (api._isStacking || !ent || typeof ent !== "object") return "";
		if (opts.isEmbeddedEntity) return "";
		if (typeof opts.htmlControlRhs === "string" && opts.htmlControlRhs.includes("data-p-build-fluff-tab-replace")) return "";
		const html = api.getBarTrHtml(ent, { page: opts.page });
		if (html) api._barShown.add(ent);
		return html;
	};
	/** Consume the name row's mark, so the next render of the same entity starts clean. */
	const isBarShown = (api, ent) => !!ent && typeof ent === "object" && api._barShown.delete(ent);
	const getBarTrHtml = (api, ent, { page, isBottom = false } = {}) => {
		const html = `${api.getSupersedesHtml(ent, { page })}${api.getSupersededByHtml(ent, { page })}`;
		if (!html) return "";
		return `<tr class="${api._CLS_BAR_ROW}"><td colspan="6"${isBottom ? ` class="${api._CLS_EXTRAS}"` : ""}>${html}</td></tr>`;
	};
	/**
	* The reciprocal banner, shown on a superseded original reached via swap-back.
	*/
	const getSupersededByHtml = (api, ent, { page } = {}) => {
		if (!api.isInitialised || !ent) return "";
		const pageHash = api._getEntPageHash(ent, { page });
		if (!pageHash) return "";
		const tos = api.getReplacements(pageHash);
		if (!tos.length) return "";
		const pts = tos.map((to) => {
			const abv = to.source ? Parser.sourceJsonToAbv(to.source) : "";
			const title = to.source ? Parser.sourceJsonToFull(to.source).qq() : "";
			return `${Renderer.get().render(`{@${to.tag || "spell"} ${to.uid}}`)}${abv ? ` <span class="ve-help-subtle" title="${title}">${abv}</span>` : ""}`;
		}).join("; ");
		return `<div class="${api._CLS_BANNER}">Replaced by ${pts}.</div>`;
	};
	/**
	* Render the sibling replacements inline, each under its own border row, so a
	* one-to-many split reads as a single stacked block.
	*/
	const getStackedTrHtml = (api, ent, { page } = {}) => {
		const siblings = api.getStackedSiblings(ent, { page });
		if (!siblings.length) return "";
		api._isStacking = true;
		try {
			return siblings.map((sib) => {
				const loaded = typeof DataLoader === "undefined" ? null : DataLoader.getFromCache(sib.page, sib.source, sib.hash);
				if (!loaded) {
					api._warmOne(sib);
					return "";
				}
				const fnRender = Renderer.hover.getFnRenderCompact(sib.page);
				if (typeof fnRender !== "function") return "";
				return `<tr><th class="ve-tbl-border ${api._CLS_EXTRAS}" colspan="6"></th></tr>${fnRender(loaded)}`;
			}).join("");
		} catch (e) {
			console.warn("[supersede] could not stack replacements", e);
			return "";
		} finally {
			api._isStacking = false;
		}
	};
	const getSupersedesHtml = (api, ent, { page } = {}) => {
		if (!api.isInitialised || !ent) return "";
		const pageHash = api._getEntPageHash(ent, { page });
		if (!pageHash) return "";
		const originals = api.getSupersededBy(pageHash);
		if (!originals?.length) return "";
		const pts = originals.map((it) => {
			const abv = it.source ? Parser.sourceJsonToAbv(it.source) : "";
			const title = it.source ? Parser.sourceJsonToFull(it.source).qq() : "";
			return `<a href="${it.page}#${it.hash}" data-vet-supersede-hash="${it.hash.qq()}" data-vet-supersede-page="${it.page.qq()}" onclick="return Renderer.supersede.handleShowOriginalClick(event, this)">${it.name.qq()}</a>${abv ? ` <span class="ve-help-subtle" title="${title}">(${abv})</span>` : ""}`;
		});
		const verb = pts.length === 1 ? "is" : "are";
		return `<div class="${api._CLS_BANNER}">${api._joinList(pts)} ${verb} replaced by this ${api._getNoun(ent, pageHash.page)}.</div>`;
	};
	/**
	* Show the original this entity replaced. Suppression is one-shot and stored in
	* sessionStorage rather than memory so it survives cross-page hover navigations.
	*/
	const handleShowOriginalClick = (api, evt, ele) => {
		const hash = ele.dataset.vetSupersedeHash;
		const page = ele.dataset.vetSupersedePage;
		if (!hash) return true;
		if (page && page !== UrlUtil.getCurrentPage()) {
			try {
				sessionStorage.setItem(api._SESSION_KEY, hash);
			} catch {}
			return true;
		}
		api._showOriginalHash = hash;
		evt.preventDefault();
		Hist.cleanSetHash(hash);
		return false;
	};
	const isShowOriginal = (api, hash) => {
		if (!hash) return false;
		if (api._showOriginalHash === hash) return true;
		try {
			if (sessionStorage.getItem(api._SESSION_KEY) === hash) {
				sessionStorage.removeItem(api._SESSION_KEY);
				api._showOriginalHash = hash;
				return true;
			}
		} catch {}
		return false;
	};

//#endregion
//#region src/lib/renderer-supersede/graph.js
	const MAX_CHAIN = 16;
	const FILTER_HEADER = "Replacements";
	const FILTER_OVERRIDDEN = "Overridden";
	const FILTER_REPLACED = "Replaced";
	const buildTarget = ({ spec, page, prop, label, problems }) => {
		if (!spec?.uid) {
			problems.push(`${label}: a "replacedBy" entry is missing "uid"`);
			return null;
		}
		const toProp = spec.prop || prop;
		const toPage = spec.page || page;
		const toTag = spec.tag || (toProp ? Parser.getPropTag(toProp) : null);
		const builder = UrlUtil.URL_TO_HASH_BUILDER[toProp] || UrlUtil.URL_TO_HASH_BUILDER[toPage];
		if (!builder) {
			problems.push(`${label}: no hash builder for "${toProp || toPage}"`);
			return null;
		}
		let unpacked;
		try {
			unpacked = DataUtil.proxy.unpackUid(toProp, spec.uid, toTag);
		} catch {
			problems.push(`${label}: could not unpack uid "${spec.uid}"`);
			return null;
		}
		return {
			page: toPage,
			hash: builder(unpacked),
			name: unpacked.name,
			source: unpacked.source,
			prop: toProp,
			uid: spec.uid,
			tag: toTag
		};
	};
	const buildEdge = (row, problems) => {
		const { page, hash, prop, replacedBy } = row || {};
		const label = `${row?.displayName || hash || "?"} (${page || "?"})`;
		const tos = replacedBy == null ? [] : [replacedBy].flat();
		if (!page || !hash || !tos.length) {
			problems.push(`${label}: needs "page", "hash", and "replacedBy"`);
			return null;
		}
		const to = [];
		for (const spec of tos) {
			const built = buildTarget({
				spec,
				page,
				prop,
				label,
				problems
			});
			if (!built) return null;
			if (built.page === page && built.hash === hash) {
				problems.push(`${label}: replaced by itself`);
				return null;
			}
			if (to.some((it) => it.page === built.page && it.hash === built.hash)) continue;
			to.push(built);
		}
		if (!to.length) return null;
		return {
			from: {
				page,
				hash
			},
			to
		};
	};
	const getTerminal = ({ fwd, from, to, maxChain = 16 }) => {
		const seen = new Set([`${from.page}|${from.hash}`]);
		let cur = to;
		for (let i = 0; i < maxChain; ++i) {
			const key = `${cur.page}|${cur.hash}`;
			if (seen.has(key)) return null;
			seen.add(key);
			const nxt = fwd[cur.page]?.[cur.hash]?.[0];
			if (!nxt) break;
			cur = nxt;
		}
		return cur;
	};
	/**
	* Collapse A->B->C into A->C so a redirect lands somewhere terminal, and drop any
	* edge that loops back on itself. A chain is followed through each hop's primary.
	* @returns {Record<string, Record<string, any[]>>}
	*/
	const resolveGraph = (fwd, problems, maxChain = 16) => {
		/** @type {Record<string, Record<string, any[]>>} */
		const out = {};
		for (const [page, byHash] of Object.entries(fwd)) for (const [hash, tos] of Object.entries(byHash)) {
			const resolved = [];
			let isCycle = false;
			for (const to of tos) {
				const end = getTerminal({
					fwd,
					from: {
						page,
						hash
					},
					to,
					maxChain
				});
				if (!end) {
					isCycle = true;
					break;
				}
				if (!resolved.some((it) => it.page === end.page && it.hash === end.hash)) resolved.push(end);
			}
			if (isCycle) {
				problems.push(`${hash} (${page}): supersession cycle`);
				continue;
			}
			MiscUtil.set(out, page, hash, resolved);
		}
		return out;
	};
	/**
	* @returns {Record<string, Record<string, any[]>>}
	*/
	const buildReverse = (fwd, origins) => {
		/** @type {Record<string, Record<string, any[]>>} */
		const out = {};
		for (const [page, byHash] of Object.entries(fwd)) for (const [hash, tos] of Object.entries(byHash)) {
			let decoded = null;
			try {
				decoded = UrlUtil.autoDecodeHash(hash, { page });
			} catch {
				decoded = null;
			}
			const origin = origins[page]?.[hash] || {};
			const name = origin.name || (decoded?.name || hash).toTitleCase();
			const source = origin.source || decoded?.source;
			for (const to of tos) MiscUtil.getOrSet(out, to.page, to.hash, []).push({
				page,
				hash,
				name,
				source
			});
		}
		return out;
	};
	const buildGraph = (rows, maxChain = 16) => {
		const fwd = {};
		const problems = [];
		const origins = {};
		const overridden = /* @__PURE__ */ new Set();
		for (const row of rows) {
			const built = buildEdge(row, problems);
			if (!built) continue;
			MiscUtil.set(fwd, built.from.page, built.from.hash, built.to);
			if (row.displayName || row.source) MiscUtil.set(origins, built.from.page, built.from.hash, {
				name: row.displayName,
				source: row.source
			});
			if (typeof row.override === "string") overridden.add(`${built.from.page}|${built.from.hash}`);
		}
		const resolvedFwd = resolveGraph(fwd, problems, maxChain);
		return {
			fwd: resolvedFwd,
			rev: buildReverse(resolvedFwd, origins),
			overridden,
			problems
		};
	};
	const isSourceAvailable = (source) => {
		if (!source) return false;
		if (typeof BrewUtil2 !== "undefined" && BrewUtil2.hasSourceJson(source)) return true;
		if (typeof PrereleaseUtil !== "undefined" && PrereleaseUtil.hasSourceJson(source)) return true;
		if (typeof SourceUtil !== "undefined" && SourceUtil.isSiteSource(source)) return true;
		return false;
	};
	const getEntPageHash = (ent, { page, prop } = {}) => {
		if (!ent) return null;
		const resolvedProp = ent.__prop || prop;
		const builder = UrlUtil.URL_TO_HASH_BUILDER[resolvedProp] || UrlUtil.URL_TO_HASH_BUILDER[page];
		if (!builder) return null;
		const pageOut = page || UrlUtil.PROP_TO_PAGE[resolvedProp];
		if (!pageOut) return null;
		try {
			return {
				page: pageOut,
				hash: builder(ent)
			};
		} catch {
			return null;
		}
	};
	/**
	* Every replacement that is currently in force, primary first.
	* @returns {any[]}
	*/
	const getReplacements = (api, { page, hash }) => {
		if (!api.isInitialised || !page || !hash) return [];
		const tos = api._fwd[page]?.[hash];
		if (!tos?.length) return [];
		return tos.filter((to) => {
			if (!api._isSourceAvailable(to.source)) return false;
			if (typeof ExcludeUtil !== "undefined" && ExcludeUtil.isInitialised && ExcludeUtil.isExcluded(to.hash, to.prop, to.source, { isNoCount: true })) return false;
			return true;
		});
	};
	/**
	* The other replacements of the same original, to render beneath this one. Only the
	* primary reports siblings; otherwise each sibling would stack the rest in turn.
	*/
	const getStackedSiblings = (api, ent, { page } = {}) => {
		if (!api.isInitialised || api._isStacking) return [];
		const pageHash = api._getEntPageHash(ent, { page });
		if (!pageHash) return [];
		const originals = api._rev[pageHash.page]?.[pageHash.hash];
		if (!originals?.length) return [];
		const out = [];
		const seen = new Set([`${pageHash.page}|${pageHash.hash}`]);
		for (const original of originals) {
			const all = api.getReplacements({
				page: original.page,
				hash: original.hash
			});
			if (all.length < 2) continue;
			if (all[0].page !== pageHash.page || all[0].hash !== pageHash.hash) continue;
			for (const to of all.slice(1)) {
				const key = `${to.page}|${to.hash}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(to);
			}
		}
		return out;
	};
	const getSupersededBy = (api, { page, hash }) => {
		if (!api.isInitialised || !page || !hash) return null;
		const out = api._rev[page]?.[hash];
		if (!out?.length) return null;
		const filtered = out.filter((it) => api.getReplacement({
			page: it.page,
			hash: it.hash
		}));
		return filtered.length ? filtered : null;
	};
	/** Which Replacements-filter pills an original carries: one, or none if it isn't mapped. */
	const getFilterValues = (api, { page, hash } = {}) => {
		if (!page || !hash || !api._fwd[page]?.[hash]) return [];
		return api._overridden.has(`${page}|${hash}`) ? [api._FILTER_OVERRIDDEN] : [api._FILTER_REPLACED];
	};
	const warmOne = (to) => {
		if (typeof DataLoader === "undefined") return;
		try {
			DataLoader.pCacheAndGet(to.page, to.source, to.hash, {
				isSilent: true,
				isOptimisticPrereleaseBrew: true
			}).then(null, () => {});
		} catch {}
	};
	/**
	* Siblings render synchronously alongside the primary, so they have to already be in
	* the DataLoader cache by then. Warm them up front; misses at render time kick off
	* another fetch so a later render succeeds.
	*/
	const warmCache = (fwd, warmOneFn = warmOne) => {
		if (typeof DataLoader === "undefined") return;
		for (const byHash of Object.values(fwd)) for (const tos of Object.values(byHash)) for (const to of tos.slice(1)) warmOneFn(to);
	};

//#endregion
//#region src/lib/renderer-supersede/guard.js
	const tryOr = (failedHooks, label, fn, fnFallback) => {
		try {
			return fn();
		} catch (e) {
			if (!failedHooks.has(label)) {
				failedHooks.add(label);
				console.error(`[supersede] ${label} failed; using the stock behaviour`, e);
				if (failedHooks.size === 1) try {
					JqueryUtil.doToast({
						type: "danger",
						content: "Content replacement hit an error and is partly off. See the console for details.",
						autoHideTime: 15e3
					});
				} catch {}
			}
			return fnFallback();
		}
	};
	const warnMissingHooks = (missing) => {
		if (!missing.length) return;
		console.warn(`[supersede] could not install ${missing.length} hook(s) — upstream probably renamed them; supersession is degraded:`, missing);
	};

//#endregion
//#region src/lib/renderer-supersede/hooks.js
	const RE_MARKER = /^\s*\{@b\s+Replaces:?\}(.*)$/i;
	const RE_TAG = /\{@(\w+)\s+([^}]*)\}/g;
	/** What may sit between a marker's tags: "A and B", "A, B.", and nothing else. */
	const RE_MARKER_GLUE = /^(?:[\s,;.&]|\band\b)*$/i;
	/**
	* Redirect a rendered tag. Single seam covering both anchor href and hover popup:
	* `getTagMeta`'s output feeds `_renderLink_getHref` and `getHoverElementAttributes`.
	*/
	const mutTagMeta = (api, tagMeta) => {
		if (!tagMeta || !api.isInitialised) return tagMeta;
		if (tagMeta.preloadId || tagMeta.customHashId || tagMeta.subhashes?.length) return tagMeta;
		if (tagMeta.isFauxPage || !tagMeta.page || !tagMeta.hash) return tagMeta;
		const to = api.getReplacement({
			page: tagMeta.page,
			hash: tagMeta.hash
		});
		if (!to) return tagMeta;
		const hashOld = tagMeta.hash;
		tagMeta.name = to.name;
		tagMeta.source = to.source;
		tagMeta.hash = to.hash;
		tagMeta.page = to.page;
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
	const isRedundantMarker = (api, str) => {
		if (!api.isInitialised || !api._fnGetTagMetaOrig) return false;
		const m = api._RE_MARKER.exec(str);
		if (!m) return false;
		const tags = [...m[1].matchAll(api._RE_TAG)];
		if (!tags.length) return false;
		if (!api._RE_MARKER_GLUE.test(m[1].replace(api._RE_TAG, ""))) return false;
		return tags.every(([, tag, text]) => {
			let meta;
			try {
				meta = api._fnGetTagMetaOrig(`@${tag}`, text);
			} catch {
				return false;
			}
			return !!(meta?.page && meta?.hash && api.getReplacement({
				page: meta.page,
				hash: meta.hash
			}));
		});
	};
	const getRedirectedHoverOpts = (api, opts) => {
		if (!opts || !api.isInitialised) return opts;
		if (opts.preloadId || opts.customHashId || opts.isFauxPage) return opts;
		const to = api.getReplacement({
			page: opts.page,
			hash: opts.hash
		});
		if (!to) return opts;
		return {
			...opts,
			page: to.page,
			source: to.source,
			hash: to.hash
		};
	};
	const decorateList = (api, listPage) => {
		if (!api.isInitialised) return;
		try {
			const page = UrlUtil.getCurrentPage();
			for (const list of listPage.primaryLists || []) for (const listItem of list.items || []) api.mutDecorateListItem(listItem, { page });
		} catch (e) {
			console.warn("[supersede] could not decorate list rows", e);
		}
	};
	/**
	* Rewrite the location hash before Hist reads it. `replaceHistoryHash` does not fire
	* a hashchange, so Back leaves the page instead of bouncing between the two entities.
	*/
	const mutRedirectLocationHash = (api) => {
		if (!api.isInitialised) return;
		const [link, ...sub] = Hist.getHashParts();
		if (!link || link === HASH_BLANK) return;
		if (api._showOriginalHash && api._showOriginalHash !== link) api._showOriginalHash = null;
		if (api._isShowOriginal(link)) return;
		const page = UrlUtil.getCurrentPage();
		const to = api.getReplacement({
			page,
			hash: link
		});
		if (!to || to.page !== page) return;
		Hist.replaceHistoryHash([to.hash, ...sub].join(HASH_PART_SEP));
	};
	const installHooksEarly = (api) => {
		const missing = [];
		if (typeof Renderer?.utils?.getTagMeta === "function") {
			const fnOrig = Renderer.utils.getTagMeta;
			api._fnGetTagMetaOrig = fnOrig;
			Renderer.utils.getTagMeta = function(...args) {
				const meta = fnOrig.apply(this, args);
				return Renderer.supersede._tryOr("getTagMeta", () => Renderer.supersede.mutTagMeta(meta), () => meta);
			};
		} else missing.push("Renderer.utils.getTagMeta");
		if (typeof Renderer?.utils?.getNameTr === "function") {
			const fnOrig = Renderer.utils.getNameTr;
			Renderer.utils.getNameTr = function(ent, opts, ...rest) {
				const html = fnOrig.call(this, ent, opts, ...rest);
				return `${Renderer.supersede._tryOr("getNameTr", () => Renderer.supersede.getNameBarTrHtml(ent, opts || {}), () => "")}${html}`;
			};
		} else missing.push("Renderer.utils.getNameTr");
		if (typeof Renderer?.utils?.getPageTr === "function") {
			const fnOrig = Renderer.utils.getPageTr;
			Renderer.utils.getPageTr = function(ent, ...rest) {
				return `${fnOrig.call(this, ent, ...rest)}${Renderer.supersede._tryOr("getPageTr", () => Renderer.supersede.getExtrasHtml(ent, { isBarShown: Renderer.supersede.isBarShown(ent) }), () => "")}`;
			};
		} else missing.push("Renderer.utils.getPageTr");
		if (typeof Renderer?.hover?.getFnRenderCompact === "function") {
			const fnOrig = Renderer.hover.getFnRenderCompact;
			Renderer.hover.getFnRenderCompact = function(page, ...rest) {
				const fn = fnOrig.call(this, page, ...rest);
				if (typeof fn !== "function" || typeof page === "string" && page.endsWith("Fluff")) return fn;
				return (ent, ...args) => {
					const html = fn(ent, ...args);
					const barAlreadyShown = Renderer.supersede.isBarShown(ent);
					if (typeof html !== "string" || html.includes(Renderer.supersede._CLS_EXTRAS)) return html;
					return `${html}${Renderer.supersede._tryOr("getFnRenderCompact", () => Renderer.supersede.getExtrasHtml(ent, {
						page,
						isBarShown: barAlreadyShown || html.includes(Renderer.supersede._CLS_BAR_ROW)
					}), () => "")}`;
				};
			};
		} else missing.push("Renderer.hover.getFnRenderCompact");
		if (typeof Renderer?.hover?.getHoverElementAttributes === "function") {
			const fnOrig = Renderer.hover.getHoverElementAttributes;
			Renderer.hover.getHoverElementAttributes = function(opts) {
				return fnOrig.call(this, Renderer.supersede._tryOr("getHoverElementAttributes", () => Renderer.supersede.getRedirectedHoverOpts(opts), () => opts));
			};
		} else missing.push("Renderer.hover.getHoverElementAttributes");
		if (typeof Renderer?.prototype?._recursiveRender === "function") {
			const fnOrig = Renderer.prototype._recursiveRender;
			Renderer.prototype._recursiveRender = function(entry, ...rest) {
				if (typeof entry === "string" && entry.includes("Replaces") && Renderer.supersede._tryOr("_recursiveRender", () => Renderer.supersede.isRedundantMarker(entry), () => false)) return;
				return fnOrig.call(this, entry, ...rest);
			};
		} else missing.push("Renderer.prototype._recursiveRender");
		api._missingHooks = missing;
	};
	/**
	* Add a "Replacements" filter to every list page, via the base class they all share.
	* Evaluated separately from FilterBox's positional pass so custom combine mode never
	* throws on a count mismatch.
	*/
	const installFilterHooks = (api) => {
		const Base = globalThis.PageFilterBase;
		const Box = globalThis.FilterBox;
		const FilterCls = globalThis.Filter;
		if (!Base?.prototype?.pInitFilterBox || !Box?.prototype?._toDisplay || !FilterCls) return ["PageFilterBase.pInitFilterBox / FilterBox._toDisplay / Filter"];
		if (Base.prototype._hbmSupersedeHooked) return [];
		Base.prototype._hbmSupersedeHooked = true;
		const K_FILTER = "_hbmSupersedeFilter";
		const K_VALUES = "_fHbmSupersede";
		const wrapped = /* @__PURE__ */ new WeakSet();
		const wrapToDisplay = (Cls) => {
			let proto = Cls.prototype;
			while (proto && proto !== Base.prototype && !Object.prototype.hasOwnProperty.call(proto, "toDisplay")) proto = Object.getPrototypeOf(proto);
			if (!proto || proto === Base.prototype || wrapped.has(proto)) return;
			wrapped.add(proto);
			const fnOrig = proto.toDisplay;
			proto.toDisplay = function(values, entity, ...rest) {
				const f = this[K_FILTER];
				if (f && !api._tryOr("Replacements filter", () => f.toDisplay(values, entity?.[K_VALUES] || []), () => true)) return false;
				return fnOrig.call(this, values, entity, ...rest);
			};
		};
		const fnInitOrig = Base.prototype.pInitFilterBox;
		Base.prototype.pInitFilterBox = async function(opts = {}) {
			const filter = api._tryOr("Replacements filter", () => {
				this[K_FILTER] ||= new FilterCls({
					header: api._FILTER_HEADER,
					items: [api._FILTER_OVERRIDDEN, api._FILTER_REPLACED],
					deselFn: (it) => it === api._FILTER_OVERRIDDEN
				});
				this[K_FILTER]._isHbmSupersede = true;
				wrapToDisplay(this.constructor);
				return this[K_FILTER];
			}, () => {
				delete this[K_FILTER];
				return null;
			});
			if (!filter) return fnInitOrig.call(this, opts);
			const fnPopulate = this._pPopulateBoxOptions;
			this._pPopulateBoxOptions = async function(o) {
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
		Base.prototype.mutateAndAddToFilters = function(entity, ...rest) {
			const out = fnMutOrig.call(this, entity, ...rest);
			if (entity && typeof entity === "object") entity[K_VALUES] = api._tryOr("Replacements filter values", () => {
				const ph = api._getEntPageHash(entity, { page: UrlUtil.getCurrentPage() });
				return ph ? api.getFilterValues(ph) : [];
			}, () => []);
			return out;
		};
		const fnBoxOrig = Box.prototype._toDisplay;
		Box.prototype._toDisplay = function(boxState, filters, entryVals) {
			if (filters?.some?.((f) => f?._isHbmSupersede)) filters = filters.filter((f) => !f?._isHbmSupersede);
			return fnBoxOrig.call(this, boxState, filters, entryVals);
		};
		return [];
	};
	/** `Hist` and `ListPage` load after `js/render.js`; hook them once everything is parsed. */
	const installHooksLate = (api) => {
		const missing = [...api._missingHooks || []];
		if (typeof Hist !== "undefined" && typeof Hist.hashChange === "function") {
			const fnOrig = Hist.hashChange;
			Hist.hashChange = function(...args) {
				Renderer.supersede._tryOr("Hist.hashChange", () => Renderer.supersede._mutRedirectLocationHash(), () => {});
				return fnOrig.apply(this, args);
			};
		} else missing.push("Hist.hashChange");
		if (typeof ListPage !== "undefined") {
			if (typeof ListPage.prototype.pOnLoad === "function") {
				const fnOrig = ListPage.prototype.pOnLoad;
				ListPage.prototype.pOnLoad = async function(...args) {
					try {
						await Renderer.supersede.pInit();
					} catch (e) {
						Renderer.supersede._tryOr("pInit", () => {
							throw e;
						}, () => {});
					}
					return fnOrig.apply(this, args);
				};
			} else missing.push("ListPage.prototype.pOnLoad");
			if (typeof ListPage.prototype._addData === "function") {
				const fnOrig = ListPage.prototype._addData;
				ListPage.prototype._addData = function(data) {
					const out = fnOrig.call(this, data);
					Renderer.supersede._decorateList(this);
					return out;
				};
			} else missing.push("ListPage.prototype._addData");
		} else missing.push("ListPage");
		missing.push(...api._installFilterHooks());
		warnMissingHooks(missing);
	};

//#endregion
//#region src/lib/renderer-supersede/index.js
/**
	* Homebrew content supersession.
	*
	* Redirects superseded 5etools entities to their replacements across list pages,
	* tag links, hover popups, and omnisearch, and renders a replacement bar above
	* the name with a one-shot swap-back link to view the original.
	*
	* Spliced onto the end of `js/render.js` by the Content replacement deploy module.
	*/
	Renderer.supersede = class {
		static _URL = "data/content-replacement.json";
		static _CLS_BANNER = CLS_BANNER;
		static _CLS_BAR_ROW = CLS_BAR_ROW;
		static _CLS_EXTRAS = CLS_EXTRAS;
		static _K_MUT = K_MUT;
		static _SESSION_KEY = SESSION_KEY;
		static _STYLE_ID = STYLE_ID;
		static _MAX_CHAIN = 16;
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
		static _overridden = /* @__PURE__ */ new Set();
		static _pInitialising = null;
		static _missingHooks = [];
		static _failedHooks = /* @__PURE__ */ new Set();
		static _showOriginalHash = null;
		static _isStacking = false;
		static _barShown = /* @__PURE__ */ new WeakSet();
		static _fnGetTagMetaOrig = null;
		static async pInit() {
			return this._pInitialising ||= this._pInit_();
		}
		static _tryOr(label, fn, fnFallback) {
			return tryOr(this._failedHooks, label, fn, fnFallback);
		}
		static async _pInit_() {
			let json = null;
			try {
				json = await DataUtil.loadJSON(`${Renderer.get().baseUrl}${this._URL}`);
			} catch {
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
			if (problems.length) console.warn(`[supersede] ${problems.length} mapping(s) ignored:`, problems);
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
			return getTerminal({
				...args,
				maxChain: this._MAX_CHAIN
			});
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
	if (typeof document !== "undefined") {
		const pInitReported = () => Renderer.supersede.pInit().catch((e) => Renderer.supersede._tryOr("pInit", () => {
			throw e;
		}, () => {}));
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pInitReported);
		else pInitReported();
	}

//#endregion
})();
