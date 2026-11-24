/**
 * Items page: merge mundane and magic lists into one table.
 *
 * Spliced onto the end of `js/items.js` by the manager's deploy modules.
 *
 * Upstream renames things (ListItem lost `.ix` for `getId()`), so this must never take
 * the page down with it: it checks what it leans on before hooking anything, and any
 * error at runtime switches it off, restores the stock two-list layout and shows a toast.
 */
(() => {
	const LOG_PREFIX = "[HBM items-single-list]";

	const UNIFIED_COLS = [
		{ clazz: "ve-col-3-5", sort: "name", label: "Name" },
		{ clazz: "ve-col-3", sort: "type", label: "Type" },
		{ clazz: "ve-col-1-5", sort: "cost", label: "Cost" },
		{ clazz: "ve-col-1-5", sort: "weight", label: "Weight" },
		{ clazz: "ve-col-0-6", sort: "attunement", label: "A.", title: "Can Be Attuned" },
		{ clazz: "ve-col-1-4", sort: "rarity", label: "Rarity" },
		{ clazz: "ve-grow", sort: "source", label: "Source", fullborder: true },
	];

	const OVERRIDDEN = ["getListItem", "_addListItem", "_pOnLoad_initVisibleItemsDisplay", "_pOnLoad_pInitPrimaryLists"];

	const toMissing = checks => checks.filter(([, isPresent]) => !isPresent).map(([name]) => name);

	// items.js is a module, so its own classes are bindings here, not globals.
	const ItemsPageCls = typeof ItemsPage === "undefined" ? null : ItemsPage;
	const getMissingDeps = () => toMissing([
		...OVERRIDDEN.map(name => [`ItemsPage#${name}`, typeof ItemsPageCls?.prototype?.[name] === "function"]),
		["SortUtil.initBtnSortHandlers", typeof globalThis.SortUtil?.initBtnSortHandlers === "function"],
		["Renderer.item.enhanceItem", typeof globalThis.Renderer?.item?.enhanceItem === "function"],
	]);
	// ListItem only becomes a global after this file runs, so it is checked at page load.
	const getMissingLoadDeps = () => toMissing([
		["ListItem#getId", typeof globalThis.ListItem?.prototype?.getId === "function"],
		["ListItem.getCommonValues", typeof globalThis.ListItem?.getCommonValues === "function"],
	]);

	const showError = (msg) => {
		try {
			JqueryUtil.doToast({ type: "danger", content: `Merged items list is off: ${msg}. Showing the standard lists; see the console for details.`, autoHideTime: 15000 });
		} catch (e) {
			// No toast available; the console error already went out.
		}
	};

	class HbmItemsSingleList {
		static isActive = true;
		static _undoDom = null;
		static _page = null;
		static _isVisibleItemsDisplayOverridden = false;

		static disable (msg, err) {
			if (!this.isActive) return;
			this.isActive = false;
			console.error(`${LOG_PREFIX} ${msg}`, err ?? "");

			try {
				this._undoDom?.();
				// Ours replaced the stock counter; put the stock one back.
				if (this._page && this._isVisibleItemsDisplayOverridden) fnsOrig._pOnLoad_initVisibleItemsDisplay.call(this._page);
			} catch (e) {
				console.error(`${LOG_PREFIX} could not restore the standard layout`, e);
			}

			showError(msg);
		}

		static applyDom (itemsPage) {
			const listContainer = document.getElementById("listcontainer");
			const mundaneTools = document.getElementById("filtertools-mundane");
			const listMundane = itemsPage._mundaneList;
			const listMagic = itemsPage._magicList;
			if (!listContainer || !mundaneTools) throw new Error("#listcontainer or #filtertools-mundane is missing");
			if (!listMundane || !listMagic) throw new Error("the mundane and magic lists were not created");

			// Look everything up before changing anything, so a failure leaves the page as it was.
			const toHide = [
				veEs(`.ve-itm__wrp-list--magic`),
				...veEm(`.ele-magic`),
				...veEm(`.ele-mundane-and-magic`),
				veEs(`h3.ele-mundane`),
			].filter(ele => ele && !ele.classList.contains("ve-hidden"));
			const toolsOrig = [...mundaneTools.childNodes];
			const { nextList: nextListOrig } = listMundane;
			const { prevList: prevListOrig } = listMagic;

			this._undoDom = () => {
				listContainer.classList.remove("hm-itm__single-list");
				toHide.forEach(ele => ele.classList.remove("ve-hidden"));
				mundaneTools.replaceChildren(...toolsOrig);
				listMundane.nextList = nextListOrig;
				listMagic.prevList = prevListOrig;
			};

			toHide.forEach(ele => ele.vee.hide());

			mundaneTools.replaceChildren();
			UNIFIED_COLS.forEach(({ clazz, sort, label, title, fullborder }) => {
				const btn = veE({
					tag: "button",
					type: "button",
					clazz: `${fullborder ? "fullborder " : ""}${clazz} sort ve-btn ve-btn-default ve-btn-xs`,
					txt: label,
					title: title || "",
				});
				btn.dataset.sort = sort;
				btn.dataset.sortby = "asc";
				mundaneTools.appendChild(btn);
			});

			SortUtil.initBtnSortHandlers(mundaneTools, listMundane);

			listMundane.nextList = null;
			listMagic.prevList = null;

			listContainer.classList.add("hm-itm__single-list");
		}
	}

	const missingDeps = getMissingDeps();
	if (missingDeps.length) {
		console.error(`${LOG_PREFIX} not installed; upstream no longer has:`, missingDeps);
		window.addEventListener("load", () => showError(`5etools changed (${missingDeps.join(", ")})`));
		return;
	}

	if (ItemsPage.prototype._hbmItemsSingleListHooked) return;
	ItemsPage.prototype._hbmItemsSingleListHooked = true;

	const fnsOrig = Object.fromEntries(OVERRIDDEN.map(name => [name, ItemsPage.prototype[name]]));

	/** Ours while the module is on; the stock method once anything has thrown. */
	const override = (name, fn) => {
		ItemsPage.prototype[name] = function (...args) {
			if (!HbmItemsSingleList.isActive) return fnsOrig[name].apply(this, args);
			try {
				return fn.apply(this, args);
			} catch (e) {
				HbmItemsSingleList.disable(`${name} failed`, e);
				return fnsOrig[name].apply(this, args);
			}
		};
	};

	override("getListItem", function (item, itI, isExcluded) {
		const hash = UrlUtil.autoEncodeHash(item);

		if (Renderer.item.isExcluded(item, {hash})) return null;
		if (item.noDisplay) return null;
		Renderer.item.enhanceItem(item);

		this._pageFilter.mutateAndAddToFilters(item, isExcluded);

		const source = Parser.sourceJsonToAbv(item.source);
		const type = item._textTypes.join(", ").toTitleCase();
		const isMundane = item._fIsMundane;

		const eleLi = veE({
			tag: "div",
			clazz: `ve-lst__row ve-flex-col ${isExcluded ? "ve-lst__row--blocklisted" : ""}`,
			click: (evt) => this._mundaneList.doSelect(listItem, evt),
			contextmenu: (evt) => this._openContextMenu(evt, this._mundaneList, listItem),
			children: [
				veE({
					tag: "a",
					href: `#${hash}`,
					clazz: "ve-lst__row-border ve-lst__row-inner",
					children: [
						veE({ tag: "span", clazz: `ve-col-3-5 ve-pl-0 ve-pr-1 ve-bold`, txt: item.name }),
						veE({ tag: "span", clazz: `ve-col-3 ve-px-1`, txt: type }),
						veE({ tag: "span", clazz: `ve-col-1-5 ve-px-1 ve-text-center`, txt: item._l_value }),
						veE({ tag: "span", clazz: `ve-col-1-5 ve-px-1 ve-text-center`, txt: item._l_weight }),
						veE({ tag: "span", clazz: `ve-col-0-6 ve-text-center`, txt: !isMundane && item._attunementCategory !== VeCt.STR_NO_ATTUNEMENT ? "×" : "" }),
						veE({
							tag: "span",
							clazz: `ve-col-1-4 ve-text-center ${!isMundane && item.rarity ? `ve-itm__rarity-${item.rarity}` : ""}`,
							title: !isMundane ? (item.rarity || "").toTitleCase() : "",
							txt: !isMundane ? Parser.itemRarityToShort(item.rarity) || "" : "",
						}),
						veE({
							tag: "span",
							clazz: `ve-col-1 ve-text-center ${Parser.sourceJsonToSourceClassname(item.source)} ve-pl-1 ve-pr-0`,
							title: `${Parser.sourceJsonToFull(item.source)}${Renderer.utils.getSourceSubText(item)}`,
							txt: source,
						}),
					],
				}),
			],
		});

		const listItem = new ListItem({
			id: itI,
			ele: eleLi,
			name: item.name,
			values: {
				source,
				...ListItem.getCommonValues(item),
				type,
				cost: item.value || 0,
				rarity: item.rarity,
				attunement: !isMundane && item._attunementCategory !== VeCt.STR_NO_ATTUNEMENT,
				weight: Parser.weightValueToNumber(item.weight),
			},
			data: {
				hash,
				isExcluded,
			},
		});

		return { mundane: listItem };
	});

	override("_addListItem", function (listItem) {
		if (listItem.mundane) this._mundaneList.addItem(listItem.mundane);
	});

	override("_pOnLoad_initVisibleItemsDisplay", function () {
		const outVisibleResults = veEs(`.ve-lst__wrp-search-visible`);
		const wrpListMundane = veEs(`.ve-itm__wrp-list--mundane`);
		const wrpListContainer = veEs(`#listcontainer`);
		this._mundaneList.on("updated", () => {
			// Once switched off, the stock counter owns this display.
			if (!HbmItemsSingleList.isActive) return;
			const current = this._mundaneList.visibleItems.length;
			const total = this._mundaneList.items.length;
			outVisibleResults.vee.html(`${current}/${total}`);
			wrpListMundane.vee.toggleClass(`ve-itm__wrp-list--empty`, current === 0);
			// Upstream hides the lists behind this class until the stock counter clears it.
			wrpListContainer.vee.removeClass(`ve-itm__listcontainer--initializing`);
		});
		HbmItemsSingleList._isVisibleItemsDisplayOverridden = true;
	});

	// Async, so the stock init runs first and only the layout swap is ours.
	ItemsPage.prototype._pOnLoad_pInitPrimaryLists = async function (...args) {
		const out = await fnsOrig._pOnLoad_pInitPrimaryLists.apply(this, args);
		HbmItemsSingleList._page = this;
		if (!HbmItemsSingleList.isActive) return out;
		const missingLoadDeps = getMissingLoadDeps();
		if (missingLoadDeps.length) {
			HbmItemsSingleList.disable(`5etools changed (${missingLoadDeps.join(", ")})`);
			return out;
		}
		try {
			HbmItemsSingleList.applyDom(this);
		} catch (e) {
			HbmItemsSingleList.disable("could not build the merged layout", e);
		}
		return out;
	};
})();
