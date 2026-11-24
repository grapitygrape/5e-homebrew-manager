// Native title tooltips wait about a second and can't be sped up, so this shows the same
// text at once. The title is lifted off while its tooltip is open, which stops the native
// one, and put back after, so upstream code that reads or rewrites titles keeps working.
(() => {
	const GAP = 6;
	const EDGE = 4;

	const tip = document.createElement("div");
	tip.className = "shell-tooltip";
	tip.setAttribute("popover", "manual");
	tip.setAttribute("role", "tooltip");

	let owner = null;

	// Upstream sometimes changes a title while it's hovered (the search clear button does).
	const titleWatch = new MutationObserver(() => {
		if (!owner?.hasAttribute("title")) return;
		const text = owner.getAttribute("title");
		owner.dataset.shellTooltip = text;
		owner.removeAttribute("title");
		if (text.trim()) { tip.textContent = text; place(); } else hide();
	});

	const place = () => {
		if (!owner) return;
		const target = owner.getBoundingClientRect();
		const box = tip.getBoundingClientRect();
		const maxX = document.documentElement.clientWidth - box.width - EDGE;
		const x = Math.max(EDGE, Math.min(target.left + (target.width - box.width) / 2, maxX));
		const below = target.bottom + GAP;
		const y = below + box.height <= window.innerHeight - EDGE ? below : Math.max(EDGE, target.top - GAP - box.height);
		tip.style.setProperty("--shell-tooltip-x", `${Math.round(x)}px`);
		tip.style.setProperty("--shell-tooltip-y", `${Math.round(y)}px`);
	};

	const hide = () => {
		if (!owner) return;
		titleWatch.disconnect();
		if (!owner.hasAttribute("title")) owner.setAttribute("title", owner.dataset.shellTooltip);
		delete owner.dataset.shellTooltip;
		owner = null;
		if (tip.matches(":popover-open")) tip.hidePopover();
	};

	const show = el => {
		if (el === owner) return;
		hide();
		const text = el.getAttribute("title");
		if (!text?.trim()) return;
		owner = el;
		el.dataset.shellTooltip = text;
		el.removeAttribute("title");
		titleWatch.observe(el, {attributes: true, attributeFilter: ["title"]});
		tip.textContent = text;
		if (!tip.isConnected) document.body.append(tip);
		// Shown fresh each time so it lands above any dialog opened since the last one.
		if (tip.matches(":popover-open")) tip.hidePopover();
		tip.showPopover();
		place();
	};

	const titled = node => node instanceof Element ? node.closest("[title]") : null;

	document.addEventListener("pointerover", evt => {
		if (evt.pointerType === "touch") return;
		const el = titled(evt.target);
		if (el) show(el);
		else if (owner && !owner.contains(evt.target)) hide();
	});
	document.addEventListener("pointerout", evt => {
		if (owner && !owner.contains(evt.relatedTarget)) hide();
	});
	document.addEventListener("focusin", evt => {
		// Text fields get focus to be typed in, and a tip there covers what appears below (search results).
		if (evt.target.matches?.("input:not([type=checkbox], [type=radio], [type=button]), textarea")) return;
		const el = titled(evt.target);
		if (el && evt.target.matches(":focus-visible")) show(el);
	});
	document.addEventListener("focusout", hide);
	document.addEventListener("pointerdown", hide, true);
	document.addEventListener("scroll", hide, true);
	document.addEventListener("keydown", evt => { if (evt.key === "Escape") hide(); });
})();
