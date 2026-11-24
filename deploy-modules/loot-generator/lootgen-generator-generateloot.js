import {LootGenGeneratorBase} from "./lootgen-generator-base.js";
import {LootGenMagicItem} from "./lootgen-magicitem.js";
import {LootGenOutputMagicItems} from "./lootgen-output.js";
import {
	AVAILABILITIES,
	DEFAULT_EXCLUDED_TYPES,
	RARITIES,
	getActiveRarities,
	getCountAvailable,
	getCrDefaults,
	getDistinctRolls,
	getItemPool,
	getItemTypes,
	getKindPool,
	getScrollItem,
	getScrollSpells,
	isPotion,
	isScroll,
	rollGold,
} from "./lootgen-generateloot-logic.js";

export class LootGenGeneratorGenerateLoot extends LootGenGeneratorBase {
	static _SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

	identifier = "generateLoot";

	_getPropAvailability (rarity) { return `gl_availability_${rarity}`; }
	_getPropCount (rarity) { return `gl_count_${rarity}`; }

	render ({tabMeta}) {
		const selCr = ComponentUiUtil.getSelEnum(this, "gl_cr", {values: Parser.CRS})
			// A DOM event, not a state hook: loading saved state mustn't overwrite the saved fields
			.vee.onn("change", () => this._gl_doApplyCrDefaults());

		const iptGoldMin = ComponentUiUtil.getIptInt(this, "gl_goldMin", 0, {min: 0, html: `<input class="ve-form-control ve-input-xs ve-text-right" title="Lowest gold">`});
		const iptGoldMax = ComponentUiUtil.getIptInt(this, "gl_goldMax", 0, {min: 0, html: `<input class="ve-form-control ve-input-xs ve-text-right" title="Highest gold">`});

		const btnRoll = veT`<button class="ve-btn ve-btn-default ve-btn-xs ve-mr-2">Generate Loot</button>`
			.vee.onn("click", () => this._gl_pDoHandleClickRollLoot());

		const btnClear = veT`<button class="ve-btn ve-btn-danger ve-btn-xs">Clear Output</button>`
			.vee.onn("click", () => this._outputManager.doClearOutput());

		veT`<div class="ve-flex-col ve-py-2 ve-px-3">
			<label class="ve-split-v-center ve-mb-2">
				<div class="ve-mr-2 ve-w-66 ve-no-shrink" title="Changing this refills the gold range and rarities with suggested values, which you can then edit.">Challenge Rating</div>
				${selCr}
			</label>

			<div class="ve-split-v-center ve-mb-2">
				<div class="ve-mr-2 ve-w-66 ve-no-shrink">Gold Range (gp)</div>
				<div class="ve-flex-v-center">
					${iptGoldMin}
					<span class="ve-mx-1">&ndash;</span>
					${iptGoldMax}
				</div>
			</div>

			<hr class="ve-hr-2">

			${this._render_getStgRarities()}

			<hr class="ve-hr-2">

			${this._render_getStgItemTypes()}

			<hr class="ve-hr-2">

			${this._render_getStgPotions()}

			<hr class="ve-hr-2">

			${this._render_getStgScrolls()}

			<div class="ve-flex-v-center ve-mb-2 ve-mt-3">
				${btnRoll}
				${btnClear}
			</div>
		</div>`.vee.appendTo(tabMeta.wrpTab);
	}

	_render_getStgRarities () {
		const rows = RARITIES.map(rarity => {
			const selAvailability = ComponentUiUtil.getSelEnum(
				this,
				this._getPropAvailability(rarity),
				{
					values: AVAILABILITIES.map(it => it.id),
					fnDisplay: id => AVAILABILITIES.find(it => it.id === id).label,
				},
			);
			const iptCount = ComponentUiUtil.getIptInt(this, this._getPropCount(rarity), 0, {min: 0, html: `<input class="ve-form-control ve-input-xs ve-text-right ve-ml-2" style="width: 4rem" title="How many ${rarity} items">`});

			return veT`<div class="ve-split-v-center ve-mb-1">
				<div class="ve-mr-2 ve-w-33 ve-no-shrink">${rarity.toTitleCase()}</div>
				<div class="ve-flex-v-center ve-grow">
					${selAvailability}
					${iptCount}
				</div>
			</div>`;
		});

		return veT`<div class="ve-flex-col">
			<div class="ve-bold ve-mb-1" title="Each item you ask for gets its own roll against the availability.">Items by Rarity</div>
			${rows}
		</div>`;
	}

	_render_getStgItemTypes () {
		const types = getItemTypes(this._dataManager.getDataItems());

		const metas = types.map(type => {
			const cb = veT`<input type="checkbox" class="ve-mr-1">`
				.vee.onn("change", () => {
					const excluded = this._state.gl_excludedItemTypes.filter(it => it !== type);
					this._state.gl_excludedItemTypes = cb.checked ? excluded : [...excluded, type];
				});

			return {
				type,
				cb,
				label: veT`<label class="ve-flex-v-center ve-w-50 ve-mb-1 ve-pr-1">${cb}<span>${type.toTitleCase()}</span></label>`,
			};
		});

		this._addHookBase("gl_excludedItemTypes", () => {
			metas.forEach(({type, cb}) => cb.checked = !this._state.gl_excludedItemTypes.includes(type));
		})();

		const btnAll = veT`<button class="ve-btn ve-btn-default ve-btn-xxs ve-mr-1">All</button>`
			.vee.onn("click", () => this._state.gl_excludedItemTypes = []);
		const btnNone = veT`<button class="ve-btn ve-btn-default ve-btn-xxs">None</button>`
			.vee.onn("click", () => this._state.gl_excludedItemTypes = [...types]);

		return veT`<div class="ve-flex-col">
			<div class="ve-split-v-center ve-mb-1">
				<div class="ve-bold">Item Types</div>
				<div class="ve-flex-v-center">${btnAll}${btnNone}</div>
			</div>
			<div class="ve-flex ve-flex-wrap">${metas.map(it => it.label)}</div>
		</div>`;
	}

	_render_getStgPotions () {
		return this._render_getStgRows({
			title: "Potions",
			labelAdd: "Add Potions",
			propRows: "gl_potionRows",
			propIsInclude: "gl_isIncludePotions",
			fnGetNewRow: () => ({id: CryptUtil.uid(), rarity: "common", quantity: 1}),
			fnGetRow: row => this._render_getRowPotion({row}),
		});
	}

	_render_getStgScrolls () {
		return this._render_getStgRows({
			title: "Spell Scrolls",
			labelAdd: "Add Scrolls",
			propRows: "gl_scrollRows",
			propIsInclude: "gl_isIncludeScrolls",
			fnGetNewRow: () => ({id: CryptUtil.uid(), level: 1, quantity: 1, school: null}),
			fnGetRow: row => this._render_getRowScroll({row}),
		});
	}

	_render_getStgRows ({title, labelAdd, propRows, propIsInclude, fnGetNewRow, fnGetRow}) {
		const wrpRows = veT`<div class="ve-flex-col"></div>`;

		const btnAdd = veT`<button class="ve-btn ve-btn-default ve-btn-xs ve-mt-1">${labelAdd}</button>`
			.vee.onn("click", () => {
				this._state[propRows] = [...this._state[propRows], fnGetNewRow()];
			});

		const stgDetails = veT`<details>
			<summary class="ve-bold ve-clickable ve-mb-1">${title}</summary>
			${wrpRows}
			${btnAdd}
		</details>`;

		// Rebuilt only when rows come or go, so editing a row keeps focus in it
		let renderedIds = null;
		this._addHookBase(propRows, () => {
			const ids = this._state[propRows].map(it => it.id).join();
			if (ids === renderedIds) return;
			renderedIds = ids;

			wrpRows.vee.empty();
			this._state[propRows].forEach(row => fnGetRow(row).vee.appendTo(wrpRows));
			if (this._state[propRows].length) stgDetails.open = true;
		})();

		// Unticked, the rows are the only way to get any, so show them
		this._addHookBase(propIsInclude, () => {
			if (!this._state[propIsInclude]) stgDetails.open = true;
			else if (!this._state[propRows].length) stgDetails.open = false;
		})();

		// Outside the details, so it can be seen while they're collapsed
		const cbIsInclude = ComponentUiUtil.getCbBool(this, propIsInclude);

		return veT`<div class="ve-flex-col">
			${stgDetails}
			<label class="ve-flex-v-center ve-mt-1" title="These can come up in the rarity rolls above. If they don't, and no rows are added here, one is added anyway.">
				${cbIsInclude}
				<span class="ve-ml-1">Include in randomized items</span>
			</label>
		</div>`;
	}

	_gl_doUpdateRow ({propRows, id, patch}) {
		this._state[propRows] = this._state[propRows].map(it => it.id === id ? {...it, ...patch} : it);
	}

	_gl_getIptRowQuantity ({propRows, row, title}) {
		const ipt = veT`<input class="ve-form-control ve-input-xs ve-text-right ve-mr-1 ve-no-shrink" style="width: 3.5rem" title="${title}">`
			.vee.onn("change", () => {
				const quantity = Math.max(UiUtil.strToInt(ipt.value, 1), 0);
				ipt.value = `${quantity}`;
				this._gl_doUpdateRow({propRows, id: row.id, patch: {quantity}});
			});
		ipt.value = `${row.quantity}`;
		return ipt;
	}

	_gl_getBtnRemoveRow ({propRows, row}) {
		return veT`<button class="ve-btn ve-btn-danger ve-btn-xxs" title="Remove"><span class="glyphicon glyphicon-trash"></span></button>`
			.vee.onn("click", () => {
				this._state[propRows] = this._state[propRows].filter(it => it.id !== row.id);
			});
	}

	_render_getRowPotion ({row}) {
		const propRows = "gl_potionRows";

		const optsRarity = RARITIES
			.map(rarity => `<option value="${rarity}">${rarity.toTitleCase()}</option>`)
			.join("");
		const selRarity = veT`<select class="ve-form-control ve-input-xs ve-mr-1" title="Rarity (optional)"><option value="">Any rarity</option>${optsRarity}</select>`
			.vee.onn("change", () => this._gl_doUpdateRow({propRows, id: row.id, patch: {rarity: selRarity.value || null}}));
		selRarity.value = row.rarity || "";

		return veT`<div class="ve-flex-v-center ve-mb-1">
			${selRarity}
			${this._gl_getIptRowQuantity({propRows, row, title: "How many potions"})}
			${this._gl_getBtnRemoveRow({propRows, row})}
		</div>`;
	}

	_render_getRowScroll ({row}) {
		const propRows = "gl_scrollRows";
		const doUpdate = patch => this._gl_doUpdateRow({propRows, id: row.id, patch});

		const optsLevel = this.constructor._SPELL_LEVELS
			.map(level => `<option value="${level}">${Parser.spLevelToFull(level)}${level ? " level" : ""}</option>`)
			.join("");
		const selLevel = veT`<select class="ve-form-control ve-input-xs ve-mr-1" title="Spell level">${optsLevel}</select>`
			.vee.onn("change", () => doUpdate({level: Number(selLevel.value)}));
		selLevel.value = `${row.level}`;

		const optsSchool = Object.entries(Parser.SP_SCHOOL_ABV_TO_FULL)
			.map(([abv, name]) => `<option value="${abv}">${name}</option>`)
			.join("");
		const selSchool = veT`<select class="ve-form-control ve-input-xs ve-mr-1" title="Spell school (optional)"><option value="">Any school</option>${optsSchool}</select>`
			.vee.onn("change", () => doUpdate({school: selSchool.value || null}));
		selSchool.value = row.school || "";

		return veT`<div class="ve-flex-v-center ve-mb-1">
			${selLevel}
			${this._gl_getIptRowQuantity({propRows, row, title: "How many scrolls"})}
			${selSchool}
			${this._gl_getBtnRemoveRow({propRows, row})}
		</div>`;
	}

	_gl_doApplyCrDefaults () {
		const {goldMin, goldMax, rarities} = getCrDefaults({cr: this._state.gl_cr, hoards: this._dataManager.getData().hoard});

		this._proxyAssignSimple("state", {
			gl_goldMin: goldMin,
			gl_goldMax: goldMax,
			...this._getStateRarities(rarities),
		});
	}

	async _gl_pDoHandleClickRollLoot () {
		const shortfalls = [];

		const gold = rollGold({min: this._state.gl_goldMin, max: this._state.gl_goldMax});
		const coins = gold ? this._stateManager.getConvertedCoins({gp: gold}) : null;

		const randomItems = await this._gl_pGetRandomItems({shortfalls});

		const magicItemsByTable = [
			{breakdown: randomItems, tier: "magic"},
			{breakdown: await this._gl_pGetPotions({randomItems, shortfalls}), tier: "potion"},
			{breakdown: await this._gl_pGetScrolls({randomItems, shortfalls}), tier: "spell scroll"},
		]
			.filter(({breakdown}) => breakdown.length)
			.map(({breakdown, tier}) => new LootGenOutputMagicItems({count: breakdown.length, breakdown, tier}));

		if (shortfalls.length) JqueryUtil.doToast({content: `Nothing to roll for: ${shortfalls.join(", ")}.`, type: "warning"});

		const lootOutput = new this._ClsLootGenOutput({
			type: `Generated Loot: CR ${this._state.gl_cr}`,
			name: `{@b Generated Loot} for Challenge Rating {@b ${this._state.gl_cr}}`,
			coins,
			magicItemsByTable,
			rendererWrapped: this._rendererWrapped,
		});
		this._outputManager.doAddOutput({lootOutput});
	}

	/** Laid out like the XGE faux tables, so [reroll] stays within the pool. */
	async _gl_pRollOnPool ({name, pool, count, breakdown}) {
		const magicItemTable = {
			name,
			diceType: pool.length,
			table: pool.map((item, i) => ({min: i + 1, max: i + 1, item: `{@item ${DataUtil.proxy.getUidPacked("item", item, "item", {isMaintainCase: true})}}`})),
		};

		for (const rowRoll of getDistinctRolls({count, size: pool.length})) {
			breakdown.push(await LootGenMagicItem.pGetMagicItemRoll({
				dataManager: this._dataManager,
				lootGenMagicItems: breakdown,
				spells: this._dataManager.getDataSpellsFiltered(),
				magicItemTable,
				rendererWrapped: this._rendererWrapped,
				rowRoll,
			}));
		}
	}

	/** The one item a ticked "Include in randomized items" promises, when neither its rows nor the rarity rolls gave one. */
	async _gl_pAddGuaranteed ({name, propRows, propIsInclude, fnIsKind, randomItems, breakdown, shortfalls}) {
		if (!this._state[propIsInclude]) return;
		if (this._state[propRows].some(row => row.quantity)) return;
		if (randomItems.some(lootItem => lootItem.item && fnIsKind(lootItem.item))) return;

		const pool = getKindPool({
			items: this._dataManager.getDataItemsFiltered(),
			fnIsKind,
			rarities: getActiveRarities(Object.fromEntries(RARITIES.map(rarity => [
				rarity,
				{availability: this._state[this._getPropAvailability(rarity)], count: this._state[this._getPropCount(rarity)]},
			]))),
		});
		if (!pool.length) return void shortfalls.push(name);

		await this._gl_pRollOnPool({name: `Generated ${name}`, pool, count: 1, breakdown});
	}

	async _gl_pGetRandomItems ({shortfalls}) {
		const breakdown = [];

		for (const rarity of RARITIES) {
			const count = getCountAvailable({
				availability: this._state[this._getPropAvailability(rarity)],
				count: this._state[this._getPropCount(rarity)],
			});
			if (!count) continue;

			const pool = getItemPool({
				items: this._dataManager.getDataItemsFiltered(),
				rarity,
				excludedTypes: this._state.gl_excludedItemTypes,
				isIncludePotions: this._state.gl_isIncludePotions,
				isIncludeScrolls: this._state.gl_isIncludeScrolls,
			});
			if (!pool.length) {
				shortfalls.push(`${rarity} items of the selected types`);
				continue;
			}

			await this._gl_pRollOnPool({name: `Generated ${rarity} items`, pool, count, breakdown});
		}

		return breakdown;
	}

	async _gl_pGetPotions ({randomItems, shortfalls}) {
		const breakdown = [];

		for (const {rarity, quantity} of this._state.gl_potionRows) {
			if (!quantity) continue;

			const potions = getKindPool({items: this._dataManager.getDataItemsFiltered(), fnIsKind: isPotion});
			const pool = rarity ? potions.filter(item => item.rarity === rarity) : potions;
			if (!pool.length) {
				shortfalls.push(`${rarity || ""} potions`.trim());
				continue;
			}

			await this._gl_pRollOnPool({name: `Generated potions`, pool, count: quantity, breakdown});
		}

		await this._gl_pAddGuaranteed({
			name: "potions",
			propRows: "gl_potionRows",
			propIsInclude: "gl_isIncludePotions",
			fnIsKind: isPotion,
			randomItems,
			breakdown,
			shortfalls,
		});

		return breakdown;
	}

	async _gl_pGetScrolls ({randomItems, shortfalls}) {
		const breakdown = [];

		for (const {level, quantity, school} of this._state.gl_scrollRows) {
			if (!quantity) continue;

			const scroll = getScrollItem({items: this._dataManager.getDataItems(), level});
			if (!scroll) {
				shortfalls.push(`${Parser.spLevelToFullLevelText(level)} scrolls`);
				continue;
			}

			const magicItemTable = {
				name: `Generated scrolls`,
				diceType: 1,
				table: [{min: 1, max: 1, spellLevel: level, item: `{@item ${DataUtil.proxy.getUidPacked("item", scroll, "item", {isMaintainCase: true})}}`}],
			};

			for (let i = 0; i < quantity; ++i) {
				breakdown.push(await LootGenMagicItem.pGetMagicItemRoll({
					dataManager: this._dataManager,
					lootGenMagicItems: breakdown,
					// Passed down as the reroll list too, so rerolling keeps the school
					spells: getScrollSpells({spells: this._dataManager.getDataSpellsFiltered(), school}),
					magicItemTable,
					rendererWrapped: this._rendererWrapped,
				}));
			}
		}

		await this._gl_pAddGuaranteed({
			name: "scrolls",
			propRows: "gl_scrollRows",
			propIsInclude: "gl_isIncludeScrolls",
			fnIsKind: isScroll,
			randomItems,
			breakdown,
			shortfalls,
		});

		return breakdown;
	}

	_getStateRarities (rarities) {
		return Object.fromEntries(
			Object.entries(rarities)
				.flatMap(([rarity, {availability, count}]) => [
					[this._getPropAvailability(rarity), availability],
					[this._getPropCount(rarity), count],
				]),
		);
	}

	_getDefaultState () {
		return {
			gl_cr: "0",
			// The CR 0 row of the hoard table, which hasn't loaded yet when this runs
			gl_goldMin: 200,
			gl_goldMax: 800,
			gl_excludedItemTypes: [...DEFAULT_EXCLUDED_TYPES],
			gl_potionRows: [],
			gl_isIncludePotions: true,
			gl_scrollRows: [],
			// Scrolls were on the list to leave out by default
			gl_isIncludeScrolls: false,
			...this._getStateRarities(getCrDefaults({cr: "0"}).rarities),
		};
	}
}
