import {RenderItems} from "./render-items.js";

/**
 * shops.html — one saved shop's stock, as a browsable item list.
 *
 * The left list is the shop's ITEMS (not the shops); clicking one shows the real
 * item stat block on the right. Which shop is shown comes from `?shop=<id>`; the
 * nav lists one entry per shop under References (see the navigation.js patch in
 * this module's module.json).
 *
 * ENTITIES ARE UPSTREAM'S, NOT OURS
 *   `data/shops.json` stores only hashes and quantities. The item objects come
 *   from `DataUtil.item.loadJSON()` — the same call items.html makes, which runs
 *   `Renderer.item.pBuildList()` and therefore includes magicvariant expansion,
 *   brew items and `_copy` resolution. So Cost/Weight/Type/rarity and the whole
 *   stat block are upstream's own, and cannot drift from what items.html shows.
 *
 * REGISTRATION
 *   Registered here rather than by patching `js/utils.js` in six places. This
 *   file is only loaded by shops.html, so the entries are safe to set at import
 *   time, and the feature's whole upstream footprint stays at one nav patch.
 *   Hashes use the ITEMS builder, so an item's hash is identical to its hash on
 *   items.html and links/hovers interoperate.
 */

UrlUtil.PG_SHOPS = "shops.html";
UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_SHOPS] = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS];
UrlUtil.PG_TO_NAME[UrlUtil.PG_SHOPS] = "Shops";

/** `?shop=<id>`; falls back to the first shop so a bare URL still shows something. */
const getRequestedShopId = () => {
	try {
		return new URLSearchParams(window.location.search).get("shop");
	} catch {
		return null;
	}
};

class ShopsSublistManager extends SublistManager {
	static _getRowTemplate () {
		return [
			new SublistCellTemplate({name: "Name", css: "ve-bold ve-col-12 ve-pl-1 ve-pr-0", colStyle: ""}),
		];
	}

	pGetSublistItem (item, hash) {
		const cellsText = [item.name];

		const ele = veT`<div class="ve-lst__row ve-lst__row--sublist ve-flex-col">
			<a href="#${hash}" class="ve-lst__row-border ve-lst__row-inner">
				${this.constructor._getRowCellsHtml({values: cellsText})}
			</a>
		</div>`
			.vee.onn("contextmenu", evt => this._handleSublistItemContextMenu(evt, listItem))
			.vee.onn("click", evt => this._listSub.doSelect(listItem, evt));

		const listItem = new ListItem({
			id: hash,
			ele,
			name: item.name,
			// {...ListItem.getCommonValues(item), quantity: count},
			data: {hash, entity: item, count, mdRow: [...cellsText]},
		});
		return listItem;
	}
}

class ShopsPage extends ListPage {
	constructor () {
		super({
			dataSource: () => ShopsPage._pGetShopItems(),

			// ListPage ALWAYS merges a prerelease and a brew source on top of
			// `dataSource` — defaulting to `PrereleaseUtil/BrewUtil2.pGetBrewProcessed()`,
			// whose `item` array is every homebrew item there is. Leaving these
			// unset appends the entire brew catalogue to the shop's stock, which
			// reads as "the filter isn't working". Return nothing: `dataSource`
			// below has already folded brew and prerelease into its lookup pool
			// and filtered the result, so there is nothing left to add.
			prereleaseDataSource: async () => ({}),
			brewDataSource: async () => ({}),

			pageFilter: new PageFilterItems(),

			// Same comparator items.html uses, so ties and the mundane/magic
			// ordering behave the way they do everywhere else on the site.
			listOptions: {fnSort: PageFilterItems.sortItems},

			dataProps: ["item"],

			bookViewOptions: {
				nameSingular: "item",
				namePlural: "items",
				pageTitle: "Shop Book View",
			},
		});

		this._shop = null;
	}

	/**
	 * Resolve the requested shop's hashes against the real item list.
	 *
	 * Returns only `item`, because ListPage pipes this through
	 * `BrewUtil2.getMergedData`, which spreads EVERY top-level key as an array —
	 * a stray object key there throws "val is not iterable" and the list silently
	 * renders empty.
	 */
	static async _pGetShopItems () {
		// `DataUtil.item.loadJSON()` is SITE ONLY — `Renderer.item.pBuildList()`
		// calls `DataLoader.pCacheAndGetAllSite`. items.html gets its homebrew
		// items from the separate prerelease/brew sources, which ListPage merges
		// in afterwards. Since this page has to filter before that merge happens,
		// it loads all three itself and pools them.
		const [shopsJson, site, prerelease, brew] = await Promise.all([
			DataUtil.loadJSON(`${Renderer.get().baseUrl}data/shops.json`).catch(() => null),
			DataUtil.item.loadJSON(),
			DataUtil.item.loadPrerelease().catch(() => ({item: []})),
			DataUtil.item.loadBrew().catch(() => ({item: []})),
		]);
		const pool = [...(site.item || []), ...(prerelease.item || []), ...(brew.item || [])];

		const shops = shopsJson?.shop || [];
		const wantedId = getRequestedShopId();
		const shop = (wantedId ? shops.find(s => s.id === wantedId) : null) || shops[0] || null;

		ShopsPage._SHOP = shop;
		ShopsPage._SHOPS = shops;
		if (!shop) return {item: []};

		const byHash = new Map();
		for (const item of pool) {
			const hash = UrlUtil.URL_TO_HASH_BUILDER[UrlUtil.PG_ITEMS](item);
			// First writer wins: site entries take precedence over a brew reprint
			// of the same name+source, matching the merge order on items.html.
			if (hash && !byHash.has(hash)) byHash.set(hash, item);
		}

		const out = [];
		const missed = [];
		for (const row of shop.items || []) {
			const item = byHash.get(row.hash);
			if (!item) { missed.push(row); continue; }
			// Copy so a quantity can be attached without mutating the shared item.
			// out.push({...item, _shopQuantity: row.quantity ?? 1});
		}

		ShopsPage._MISSED = missed;
		if (missed.length) {
			// Loud, because the alternative is a shop that quietly sells less than
			// it should. Almost always means the item's book isn't in toImport.
			// eslint-disable-next-line no-console
			console.warn(`[shops] ${missed.length} entr${missed.length === 1 ? "y" : "ies"} in "${shop.name}" matched no loaded item:`, missed);
		}
		return {item: out};
	}

	async _pOnLoad_pPostLoad () {
		const shop = ShopsPage._SHOP;
		const shops = ShopsPage._SHOPS || [];

		const eleTitle = document.getElementById("page__title");
		const eleSub = document.getElementById("page__subtitle");

		if (!shop) {
			if (eleSub) {
				eleSub.textContent = shops.length
					? `No shop matches "${getRequestedShopId()}".`
					: "No shops yet.";
			}
			return;
		}

		if (eleTitle) eleTitle.textContent = shop.name;
		if (eleSub) {
			// Count what failed to resolve here, against the brew this browser loaded.
			const missing = (ShopsPage._MISSED || []).length;
			eleSub.textContent = `${shop.itemCount} items · ${ShopsPage._getValueStr(shop.totalCp)}`
				+ (missing ? ` · ${missing} not in any loaded source` : "");
		}
		document.title = `${shop.name} - 5etools`;
	}

	/** Copper to the shortest sensible coin string. */
	static _getValueStr (cp) {
		if (cp == null) return "—";
		if (cp === 0) return "Free";
		if (cp >= 100) return `${cp / 100} gp`;
		if (cp >= 10) return `${cp / 10} sp`;
		return `${cp} cp`;
	}

	getListItem (item, ixItem, isExcluded) {
		const hash = UrlUtil.autoEncodeHash(item);
		if (Renderer.item.isExcluded(item, {hash})) return null;
		if (item.noDisplay) return null;

		// Populates _textTypes, _l_value, _l_weight, _fIsMundane and the rest that
		// PageFilterItems and the list row both read. items.js does this first too.
		Renderer.item.enhanceItem(item);

		this._pageFilter.mutateAndAddToFilters(item, isExcluded);

		const source = Parser.sourceJsonToAbv(item.source);
		const type = (item._textTypes || []).join(", ").toTitleCase();

		// Column spans mirror items.html exactly (3.5 + 4.5 + 1.5 + 1.5 + 1 = 12).
		const eleLi = document.createElement("div");
		eleLi.className = `ve-lst__row ve-flex-col ${isExcluded ? "ve-lst__row--blocklisted" : ""}`;
		eleLi.innerHTML = `<a href="#${hash}" class="ve-lst__row-border ve-lst__row-inner">
			<span class="ve-col-3-5 ve-pl-0 ve-pr-1 ve-bold">${item.name.qq()}</span>
			<span class="ve-col-4-5 ve-px-1">${type.qq()}</span>
			<span class="ve-col-1-5 ve-px-1 ve-text-center">${item._l_value || "—"}</span>
			<span class="ve-col-1-5 ve-px-1 ve-text-center">${item._l_weight || "—"}</span>
			<span class="ve-col-1 ve-text-center ${Parser.sourceJsonToSourceClassname(item.source)} ve-pl-1 ve-pr-0" title="${Parser.sourceJsonToFull(item.source).qq()}">${source}</span>
		</a>`;

		const listItem = new ListItem({
			id: ixItem,
			ele: eleLi,
			name: item.name,
			values: {
				...ListItem.getCommonValues(item),
				source,
				type,
				cost: item.value ?? 0,
				weight: Parser.weightValueToNumber(item.weight),
			},
			data: {hash, isExcluded},
		});

		eleLi.addEventListener("click", (evt) => this._list.doSelect(listItem, evt));
		eleLi.addEventListener("contextmenu", (evt) => this._openContextMenu(evt, this._list, listItem));

		return listItem;
	}

	_renderStats_doBuildStatsTab ({ent}) {
		this._pgContent.vee.empty().vee.appends(RenderItems.getRenderedItem(ent));
	}
}

const shopsPage = new ShopsPage();
shopsPage.sublistManager = new ShopsSublistManager();
window.addEventListener("load", () => shopsPage.pOnLoad());

globalThis.dbg_page = shopsPage;
