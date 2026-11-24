(() => {
	const hiddenPages = new Set([/* HM_HIDDEN_PAGES */]);
	const hiddenLabels = new Set([/* HM_HIDDEN_LABELS */]);
	if (typeof NavBar === "undefined" || typeof NavBar._addElement_li !== "function") return;
	const origAddLi = NavBar._addElement_li.bind(NavBar);
	NavBar._addElement_li = function (opts) {
		if (opts && (hiddenPages.has(opts.page) || hiddenLabels.has(opts.aText))) return;
		return origAddLi(opts);
	};
})();
