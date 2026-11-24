/**
 * Custom item prices.
 *
 * The manager writes the DM's prices into each item's `value` on deploy and keeps
 * the range and the value it replaced in `hbmPrice` (all in copper). This puts
 * them in a hover on the cost in the item view. Spliced onto the end of
 * `js/render.js` by the Item prices module; the item-view cost cell calls it.
 *
 * Magic variant prices are on top of the base item (`plusBase`): a specific
 * variant (+1 Plate) carries `_baseValue`, so its range adds that too. The
 * generic variant (+1 Armor) has no base, so its hover says so instead.
 */
Renderer.item.getHbmCostHtml = function (item, {styleHint = null} = {}) {
	const cost = Parser.itemValueToFullMultiCurrency(item, {styleHint});
	const meta = item.hbmPrice;
	if (!cost || !meta) return cost;

	const base = meta.plusBase ? (item._baseValue || 0) : 0;
	const toCost = value => Parser.itemValueToFullMultiCurrency({value: value + base}, {styleHint});
	const {min, max, original} = meta;
	const parts = [];
	if (min != null && max != null) parts.push(`DM range: ${toCost(min)} – ${toCost(max)}`);
	else if (min != null) parts.push(`DM range: from ${toCost(min)}`);
	else if (max != null) parts.push(`DM range: up to ${toCost(max)}`);
	if (meta.plusBase && item._baseValue == null) parts.push("Plus the base item's cost");
	// The same figure twice says nothing.
	if (original != null && original !== item.value) parts.push(`Original: ${Parser.itemValueToFullMultiCurrency({value: original}, {styleHint})}`);
	if (!parts.length) return cost;

	return `<span class="ve-help-subtle" title="${parts.join(" · ").qq()}">${cost}</span>`;
};
