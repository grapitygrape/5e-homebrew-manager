// Upstream's ads: the slots it calls "cancer" (cancer__ wrappers, data-cancer-id hooks,
// --cancer layout classes, <!--5ETOOLS_AD_*--> placeholders), the script anchor their
// hosting fills in, and the ad network's consent box, scripts and slot ids. None of it belongs in what we ship, so save-patch
// and the build refuse anything that adds it.

// Code we add: any mention at all.
const IN_CODE = /cancer|5ETOOLS_AD_|5ETOOLS_SCRIPT_ANCHOR|consent-box|nitroAds|__cmp|__tcfapi|ccpa|div-gpt-ad/i;
// Generated pages also carry book and policy text, where "cancer" or "advertising" is
// just a word, so match markup only.
const IN_HTML = /cancer__[\w-]*|data-cancer-id|[\w-]+--cancer\b|5ETOOLS_AD_\w*|5ETOOLS_SCRIPT_ANCHOR|consent-box|__cmp\w*|nitroAds|__tcfapi|data-ccpa-link|div-gpt-ad[\w-]*/g;

export const adSlotsInPatch = patch => {
	const hits = [];
	let file = null;
	for (const line of patch.split("\n")) {
		const header = line.match(/^diff --git a\/\S+ b\/(\S+)$/);
		if (header) file = header[1];
		else if (line.startsWith("+") && !line.startsWith("+++ ") && IN_CODE.test(line)) hits.push({file, text: line.slice(1)});
	}
	return hits;
};

export const adSlotsInHtml = html => html.match(IN_HTML) ?? [];
