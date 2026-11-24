/**
 * Items page quick filters.
 *
 * Toggle buttons beneath the filter mini-pills (above the list column headers) for
 * All / Mundane / Magic / Variants. Each preset updates the native Miscellaneous
 * and Category filters so the mini-pill summary stays in sync.
 *
 * Spliced onto the end of `js/items.js` by the manager's deploy modules.
 */
(() => {
	const PILL_IGNORE = 0;
	const PILL_YES = 1;
	const PILL_NO = 2;

	const MODES = [
		{id: "all", label: "All Items"},
		{id: "mundane", label: "Mundane"},
		{id: "magic", label: "Magic"},
		{id: "variants", label: "Variants", title: "Generic variant types (e.g. +1 Weapon, Adamantine Armor)"},
	];

	const DEFAULT_CATEGORY = {
		Basic: PILL_IGNORE,
		"Generic Variant": PILL_IGNORE,
		"Specific Variant": PILL_NO,
		Other: PILL_IGNORE,
	};

	const DEFAULT_MISC_MUNDANE_MAGIC = {
		Mundane: PILL_IGNORE,
		Magic: PILL_IGNORE,
	};

	class HbmItemsQuickFilter {
		static install (itemsPage) {
			if (itemsPage._hbmItemsQuickFilter) return itemsPage._hbmItemsQuickFilter;
			itemsPage._hbmItemsQuickFilter = new HbmItemsQuickFilter(itemsPage);
			return itemsPage._hbmItemsQuickFilter;
		}

		constructor (itemsPage) {
			this._itemsPage = itemsPage;
			this._mode = "all";
			this._isApplying = false;
			this._btnByMode = {};
		}

		_getFilterBox () { return this._itemsPage._pageFilter?.filterBox; }

		_render () {
			const filterBox = this._getFilterBox();
			if (!filterBox || this._wrp) return;

			const anchor = document.getElementById("filtertools-mundane");
			if (!anchor?.parentElement) return;

			const wrp = veE({
				tag: "div",
				clazz: "hm-itm__quick-filter ve-btn-group ve-flex ve-w-100 ve-no-shrink ve-mb-1",
				children: MODES.map(mode => {
					const btn = veE({
						tag: "button",
						type: "button",
						clazz: "ve-btn ve-btn-default ve-btn-xs ve-flex-1",
						txt: mode.label,
						title: mode.title || "",
						click: () => this._setMode(mode.id),
					});
					this._btnByMode[mode.id] = btn;
					return btn;
				}),
			});

			anchor.parentElement.insertBefore(wrp, anchor);
			this._wrp = wrp;

			// Runs on every filter change, so a throw must not reach the filter box.
			filterBox.on("valchange", () => {
				try {
					this._syncFromFilters();
				} catch (e) {
					console.error("[HBM items-quick-filter] could not sync the buttons", e);
				}
			});
			this._syncFromFilters();
		}

		_setMode (mode) {
			const filterBox = this._getFilterBox();
			if (!filterBox) return;

			const values = filterBox.getValues();
			const misc = {...(values.Miscellaneous || {})};
			const category = {...(values.Category || {})};

			switch (mode) {
				case "mundane":
					Object.assign(misc, {Mundane: PILL_YES, Magic: PILL_NO});
					Object.assign(category, DEFAULT_CATEGORY);
					break;
				case "magic":
					Object.assign(misc, {Mundane: PILL_NO, Magic: PILL_YES});
					Object.assign(category, DEFAULT_CATEGORY);
					break;
				case "variants":
					Object.assign(misc, DEFAULT_MISC_MUNDANE_MAGIC);
					Object.assign(category, {
						Basic: PILL_NO,
						"Generic Variant": PILL_YES,
						"Specific Variant": PILL_NO,
						Other: PILL_NO,
					});
					break;
				case "all":
				default:
					Object.assign(misc, DEFAULT_MISC_MUNDANE_MAGIC);
					Object.assign(category, DEFAULT_CATEGORY);
					break;
			}

			this._isApplying = true;
			filterBox.setFromValues({Miscellaneous: misc, Category: category});
			this._isApplying = false;
			this._mode = mode;
			this._updateButtons();
		}

		_detectMode (values) {
			const misc = values.Miscellaneous || {};
			const category = values.Category || {};

			if (misc.Mundane === PILL_YES && misc.Magic === PILL_NO) return "mundane";
			if (misc.Mundane === PILL_NO && misc.Magic === PILL_YES) return "magic";

			const isVariants = category.Basic === PILL_NO
				&& category["Generic Variant"] === PILL_YES
				&& category["Specific Variant"] === PILL_NO
				&& category.Other === PILL_NO;
			if (isVariants) return "variants";

			return "all";
		}

		_syncFromFilters () {
			if (this._isApplying) return;

			const filterBox = this._getFilterBox();
			if (!filterBox) return;

			this._mode = this._detectMode(filterBox.getValues());
			this._updateButtons();
		}

		_updateButtons () {
			Object.entries(this._btnByMode).forEach(([mode, btn]) => {
				btn.vee.toggleClass("ve-active", mode === this._mode);
			});
		}
	}

	const fnOrigInit = ItemsPage.prototype._pOnLoad_pInitPrimaryLists;
	if (!fnOrigInit._hbmItemsQuickFilterHooked) {
		fnOrigInit._hbmItemsQuickFilterHooked = true;
		ItemsPage.prototype._pOnLoad_pInitPrimaryLists = async function (...args) {
			const out = await fnOrigInit.apply(this, args);
			// A throw here would reject the page's whole load; lose the buttons instead.
			try {
				HbmItemsQuickFilter.install(this)._render();
			} catch (e) {
				console.error("[HBM items-quick-filter] could not add the quick filters", e);
				try {
					JqueryUtil.doToast({type: "danger", content: "Item quick filters are off: they failed to load. See the console for details.", autoHideTime: 15000});
				} catch (eToast) {
					// No toast available; the console error already went out.
				}
			}
			return out;
		};
	}
})();
