// The rules behind the Generate Loot tab. No site globals, so the app's tests can import it.

export const AVAILABILITIES = [
	{id: "none", label: "None", chance: 0},
	{id: "scarce", label: "Scarce (25%)", chance: 0.25},
	{id: "possible", label: "Possible (50%)", chance: 0.5},
	{id: "likely", label: "Likely (75%)", chance: 0.75},
	{id: "guaranteed", label: "Guaranteed", chance: 1},
];

export const RARITIES = ["common", "uncommon", "rare", "very rare", "legendary", "artifact"];

export const DEFAULT_EXCLUDED_TYPES = [
	"adventuring gear",
	"ammunition",
	"concoction",
	"explosive",
	"monstrous graft",
	"spell catalyst",
	"spellcasting focus",
	"symbiont",
	"tack and harness",
	"tattoo",
	"trade good",
	"vehicle (air)",
	"vehicle (land)",
	"vehicle (space)",
	"vehicle (water)",
];

// What a CR starts each rarity at, by the same tiers as the site's treasure tables
const RARITY_DEFAULTS_BY_CR_MIN = {
	0: {common: ["guaranteed", 2], uncommon: ["possible", 1]},
	5: {common: ["likely", 2], uncommon: ["guaranteed", 2], rare: ["possible", 1]},
	11: {uncommon: ["likely", 2], rare: ["guaranteed", 2], "very rare": ["possible", 1]},
	17: {rare: ["likely", 3], "very rare": ["guaranteed", 2], legendary: ["possible", 1]},
};

const getCrNumber = cr => String(cr).includes("/") ? 0 : Number(cr);

/** The lowest and highest results of a coin formula like "2d4*100". */
export const getCoinFormulaRange = (formula) => {
	const m = /^(\d+)d(\d+)(?:\*(\d+))?$/.exec(formula || "");
	if (!m) return {min: 0, max: 0};
	const [count, faces, mult] = [m[1], m[2], m[3] ?? 1].map(Number);
	return {min: count * mult, max: count * faces * mult};
};

/** The starting gold range and rarity rows for a CR. Gold comes from the 2024 hoard table in loot.json. */
export const getCrDefaults = ({cr, hoards}) => {
	const crNumber = getCrNumber(cr);
	const hoard = (hoards || []).find(it => it.source === "XDMG" && crNumber >= it.crMin && crNumber <= it.crMax);
	const gold = getCoinFormulaRange(hoard?.coins?.gp);

	const crMin = Object.keys(RARITY_DEFAULTS_BY_CR_MIN).map(Number).filter(it => it <= crNumber).at(-1) ?? 0;
	const rarities = Object.fromEntries(RARITIES.map(rarity => {
		const [availability, count] = RARITY_DEFAULTS_BY_CR_MIN[crMin][rarity] || ["none", 0];
		return [rarity, {availability, count}];
	}));

	return {goldMin: gold.min, goldMax: gold.max, rarities};
};

export const rollGold = ({min, max, rng = Math.random}) => {
	const low = Math.min(min, max);
	const high = Math.max(min, max);
	return low + Math.floor(rng() * (high - low + 1));
};

/** Each of the `count` things gets its own roll against the availability. */
export const getCountAvailable = ({availability, count, rng = Math.random}) => {
	const chance = AVAILABILITIES.find(it => it.id === availability)?.chance ?? 0;
	return Array.from({length: Math.max(count, 0)}).filter(() => rng() < chance).length;
};

// Descriptions on top of an item's real type. Left in, unticking "melee weapon" would still roll longswords as "martial weapon".
const DESCRIPTIVE_TYPES = new Set(["simple weapon", "martial weapon", "firearm", "renaissance", "modern", "futuristic"]);

const getTypes = (item) => {
	let types = (item._textTypes || []).filter(it => !DESCRIPTIVE_TYPES.has(it));
	// A staff is labelled melee only because it can be swung, so "only Staff ticked" should still roll staffs
	if (item.staff) types = types.filter(it => it !== "melee weapon");
	// The catch-all gives way to anything more specific, so tattoos go by Tattoo alone
	if (types.length > 1) types = types.filter(it => it !== "wondrous item");
	return types.length ? types : ["other"];
};

// Potions and scrolls have their own sections, so they stay out of the item type checkboxes.
// Going by the item's type also keeps enspelled staffs, which have a spellScrollLevel too, out of the scrolls.
const getTypeAbv = item => item.type?.split("|")[0];
export const isPotion = item => getTypeAbv(item) === "P";
export const isScroll = item => getTypeAbv(item) === "SC";

const isRollable = item => RARITIES.includes(item.rarity) && item._category !== "Generic Variant";

const SECTION_TYPES = new Set(["potion", "scroll"]);

/** Every type a rollable item has, so homebrew types like "component" appear once their brew is loaded. */
export const getItemTypes = (items) => {
	const types = new Set(
		items
			.filter(item => isRollable(item) && !isPotion(item) && !isScroll(item))
			.flatMap(getTypes)
			.filter(type => !SECTION_TYPES.has(type)),
	);
	return [...types].sort((a, b) => a.localeCompare(b));
};

/**
 * An item needs all of its types ticked, so unticking one always removes what it names.
 * @param {{items: any[], rarity: string, excludedTypes?: string[], isIncludePotions?: boolean, isIncludeScrolls?: boolean}} opts
 */
export const getItemPool = ({items, rarity, excludedTypes = [], isIncludePotions = false, isIncludeScrolls = false}) => {
	const excluded = new Set(excludedTypes);
	return items
		.filter(isRollable)
		.filter((item) => {
			if (item.rarity !== rarity) return false;
			if (isPotion(item)) return isIncludePotions;
			if (isScroll(item)) return isIncludeScrolls;
			return getTypes(item).every(type => !excluded.has(type));
		});
};

/** The rarities the rarity rows can actually produce. */
export const getActiveRarities = rows => Object.entries(rows)
	.filter(([, {availability, count}]) => availability !== "none" && count > 0)
	.map(([rarity]) => rarity);

/**
 * The potions or scrolls to choose from, by the given rarities. With none given, or none matching, any rarity will do.
 * @param {{items: any[], fnIsKind: (item: any) => boolean, rarities?: string[]}} opts
 */
export const getKindPool = ({items, fnIsKind, rarities = []}) => {
	const pool = items.filter(item => isRollable(item) && fnIsKind(item));
	const matching = pool.filter(item => rarities.includes(item.rarity));
	return matching.length ? matching : pool;
};

/** 1-based rolls on a table of `size` rows. Rows only repeat once all of them have been used. */
export const getDistinctRolls = ({count, size, rng = Math.random}) => {
	if (!size) return [];

	const out = [];
	let remaining = [];
	while (out.length < count) {
		if (!remaining.length) remaining = Array.from({length: size}, (_, i) => i + 1);
		out.push(remaining.splice(Math.floor(rng() * remaining.length), 1)[0]);
	}
	return out;
};

/** @param {{spells: any[], school?: string | null}} opts */
export const getScrollSpells =({spells, school = null}) => school ? spells.filter(it => it.school === school) : spells;

/** The generic scroll item for a spell level, preferring the 2024 one. */
export const getScrollItem = ({items, level}) => {
	const scrolls = items.filter(it => isScroll(it) && it.spellScrollLevel === level);
	return scrolls.find(it => it.source === "XDMG") || scrolls.find(it => it.source === "DMG") || scrolls[0] || null;
};
