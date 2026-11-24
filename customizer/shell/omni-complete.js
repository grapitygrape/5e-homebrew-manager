// Suggestions for the search box's in: and source: syntax, like a chat app's @-mentions.
// The lists come from upstream's own search index, so homebrew and partnered categories
// and sources show up too. The pure functions are exported for the tests.

// in: values can contain spaces ("class feature"); source: takes the rest of the query.
const TOKEN = /(^|\s)(in|source):/gi;
// The menu scrolls; this only bounds the work for long source lists.
const MAX_ITEMS = 50;

export const findToken = (text, caret) => {
	const before = text.slice(0, caret);
	let last = null;
	for (const m of before.matchAll(TOKEN)) last = m;
	if (!last) return null;

	const start = last.index + last[1].length;
	const afterColon = start + last[2].length + 1;
	const valueStart = afterColon + before.slice(afterColon).match(/^\s*!?/)[0].length;
	if (valueStart > caret) return null;
	return {key: last[2].toLowerCase(), start, valueStart, value: text.slice(valueStart, caret)};
};

// 0: a key starts with the value. 1: a word of the name does. 2: a key contains it.
const rankOf = (item, v) => {
	if (item.keys.some(k => k.startsWith(v))) return 0;
	for (let i = item.words.indexOf(v); i !== -1; i = item.words.indexOf(v, i + 1)) {
		if (i === 0 || /[^a-z0-9']/.test(item.words[i - 1])) return 1;
	}
	if (item.keys.some(k => k.includes(v))) return 2;
	return -1;
};

export const rankCompletions = (token, data) => {
	if (!token) return [];
	const v = token.value.toLowerCase();
	const out = (data[token.key] || [])
		.map(item => ({item, rank: rankOf(item, v)}))
		.filter(it => it.rank !== -1)
		.sort((a, b) => a.rank - b.rank || a.item.label.localeCompare(b.item.label))
		.map(it => it.item);
	// Nothing left to complete, so Enter should search instead of picking it again.
	if (out.length === 1 && out[0].insert.toLowerCase() === v) return [];
	return out;
};

// The rest of the word under the caret belongs to the token too, as when picking mid-word.
const tokenEnd = (text, caret) => {
	let end = caret;
	while (end < text.length && !/\s/.test(text[end])) end++;
	return end;
};

// What to search for: a token that still has suggestions is unfinished, and upstream
// would search for it as plain text, so it's left out.
export const searchText = (text, caret, data) => {
	const token = data ? findToken(text, caret) : null;
	if (!token || !rankCompletions(token, data).length) return text;
	return `${text.slice(0, token.start)} ${text.slice(tokenEnd(text, caret))}`.replace(/\s+/g, " ").trim();
};

export const applyCompletion = (text, caret, token, item) => {
	const end = tokenEnd(text, caret);

	if (token.key === "source") {
		// Anything after source: is read as part of the source, so it has to go last.
		const rest = `${text.slice(0, token.start)} ${text.slice(end)}`.replace(/\s+/g, " ").trim();
		const out = `${rest ? `${rest} ` : ""}${text.slice(token.start, token.valueStart)}${item.insert}`;
		return {text: out, caret: out.length};
	}

	const head = text.slice(0, token.valueStart) + item.insert;
	const tail = text.slice(end);
	const out = /^\s/.test(tail) ? head + tail : `${head} ${tail}`;
	return {text: out, caret: head.length + 1};
};

// An alias's count is the total of the categories it stands for. One that would find
// nothing in this index isn't worth offering.
export const aliasItems = (aliases, counts) => {
	const countOf = new Map(Object.entries(counts || {}).map(([name, n]) => [name.toLowerCase(), n]));
	return Object.entries(aliases || {}).flatMap(([alias, names]) => {
		// Upstream lists some names twice (opf has Rune Knight Rune twice).
		const lower = [...new Set(names.map(n => n.toLowerCase()))];
		const total = lower.reduce((sum, n) => sum + (countOf.get(n) || 0), 0);
		if (!total) return [];
		const note = lower.join(", ");
		return [{insert: alias, label: alias, note, detail: total.toLocaleString(), keys: [alias], words: note}];
	});
};

// Upstream's in: pattern tries names in index order, so "in:class feature" reads as "class"
// plus the word "feature". Only offer values the pattern reads back whole.
export const keepAccepted = (items, re) => {
	if (!re) return items;
	const once = new RegExp(re.source, "i");
	return items.filter(it => once.exec(`in:${it.insert}`)?.groups?.category?.toLowerCase() === it.insert.toLowerCase());
};

// Reads upstream's private index fields; if a release renames them, there's just no menu.
const buildData = (backing, parser) => {
	const counts = backing._CATEGORY_COUNTS || {};
	const categories = Object.entries(counts).map(([name, n]) => {
		const lower = name.toLowerCase();
		return {insert: lower, label: lower, detail: n.toLocaleString(), keys: [lower], words: lower};
	});

	const seen = new Set();
	const sources = [];
	for (const doc of Object.values(backing._searchIndex?.documentStore?.docs || {})) {
		if (!doc.s || seen.has(doc.s)) continue;
		seen.add(doc.s);
		const abv = parser.sourceJsonToAbv(doc.s);
		const full = parser.sourceJsonToFull?.(doc.s) || doc.s;
		sources.push({insert: abv, label: abv, detail: full, keys: [abv.toLowerCase(), doc.s.toLowerCase()], words: full.toLowerCase()});
	}

	const unique = items => [...new Map(items.map(it => [it.insert.toLowerCase(), it])).values()];
	return {
		in: keepAccepted(
			unique([...categories, ...aliasItems(backing.getCategoryAliasesShort?.(), counts), ...aliasItems(backing._IN_CATEGORY_ALIAS, counts)]),
			backing._RE_SYNTAX__IN_CATEGORY,
		),
		source: unique(sources),
	};
};

const initMenu = () => {
	const GAP = 4;
	const isSearchBox = el => el?.classList?.contains("omni__input");

	let data = null;
	let loading = null;
	const loadData = () => loading ||= (async () => {
		const backing = globalThis.OmnisearchBacking;
		if (typeof backing?._pInit !== "function") return null;
		await backing._pInit();
		data = buildData(backing, globalThis.Parser);
		return data;
	})().catch(e => {
		console.warn("Search suggestions unavailable:", e);
		return null;
	});

	const menu = document.createElement("div");
	menu.className = "omni-complete";
	menu.id = "omni-complete";
	menu.setAttribute("popover", "manual");
	menu.setAttribute("role", "listbox");
	menu.setAttribute("aria-label", "Search syntax suggestions");

	let input = null;
	let token = null;
	let items = [];
	let active = 0;
	let isOpen = false;
	// Esc or a pick hides the menu until the next keystroke that changes the text.
	let isHeld = false;

	const close = () => {
		if (!isOpen) return;
		isOpen = false;
		menu.hidePopover();
		input?.setAttribute("aria-expanded", "false");
		input?.removeAttribute("aria-activedescendant");
	};

	const setActive = (ix) => {
		active = (ix + items.length) % items.length;
		menu.querySelectorAll("[role=option]").forEach((opt, i) => opt.setAttribute("aria-selected", String(i === active)));
		const opt = menu.children[active];
		input.setAttribute("aria-activedescendant", opt.id);
		opt.scrollIntoView({block: "nearest"});
	};

	const update = () => {
		if (isHeld || !data || !input || document.activeElement !== input || input.selectionStart !== input.selectionEnd) return close();
		token = findToken(input.value, input.selectionStart);
		items = rankCompletions(token, data).slice(0, MAX_ITEMS);
		if (!items.length) return close();

		menu.replaceChildren(...items.map((it, i) => {
			const opt = document.createElement("div");
			opt.className = "omni-complete-option";
			opt.id = `omni-complete-${i}`;
			opt.setAttribute("role", "option");
			const part = (className, text) => {
				const span = document.createElement("span");
				span.className = className;
				span.textContent = text;
				return span;
			};
			opt.append(part("omni-complete-label", it.label));
			if (it.note) opt.append(part("omni-complete-note", `(${it.note})`));
			opt.append(part("omni-complete-detail", it.detail));
			return opt;
		}));

		if (!menu.isConnected) document.body.append(menu);
		const r = input.getBoundingClientRect();
		menu.style.setProperty("--omni-complete-x", `${r.left}px`);
		menu.style.setProperty("--omni-complete-y", `${r.bottom + GAP}px`);
		menu.style.setProperty("--omni-complete-min-size", `${r.width}px`);
		if (!isOpen) {
			menu.showPopover();
			isOpen = true;
		}
		input.setAttribute("aria-expanded", "true");
		setActive(0);
	};

	// Upstream searches on keyup, and ignores Enter's; this runs a search for the box's text.
	const research = () => input.dispatchEvent(new KeyboardEvent("keyup", {key: "Unidentified", bubbles: true}));

	const accept = (ix = active) => {
		const out = applyCompletion(input.value, input.selectionStart, token, items[ix]);
		input.value = out.text;
		input.setSelectionRange(out.caret, out.caret);
		isHeld = true;
		close();
		research();
	};

	// Upstream's search asks for its query here (js/omnisearch.js, _pDoSearch).
	globalThis.ShellOmniComplete = {
		getSearchText: ipt => searchText(ipt.value, ipt.selectionStart ?? ipt.value.length, data),
	};

	document.addEventListener("focusin", evt => {
		if (!isSearchBox(evt.target)) return;
		input = evt.target;
		input.setAttribute("role", "combobox");
		input.setAttribute("aria-autocomplete", "list");
		input.setAttribute("aria-controls", menu.id);
		input.setAttribute("aria-expanded", "false");
		loadData();
	});
	document.addEventListener("focusout", evt => {
		if (evt.target === input) close();
	});
	document.addEventListener("input", evt => {
		if (evt.target !== input) return;
		isHeld = false;
		if (data) update();
		// The search that ran before the lists loaded didn't know to leave the token out.
		else loadData().then(() => { update(); research(); });
	});
	// Moving the caret can land it in a different token.
	document.addEventListener("click", evt => {
		if (evt.target === input) update();
	});
	document.addEventListener("keyup", evt => {
		if (evt.target === input && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(evt.key)) update();
	});
	window.addEventListener("resize", close);

	// Capture phase, so these keys reach the menu before upstream's handlers on the input.
	window.addEventListener("keydown", evt => {
		if (!isOpen || evt.target !== input || evt.altKey || evt.ctrlKey || evt.metaKey) return;
		switch (evt.key) {
			case "ArrowDown": setActive(active + 1); break;
			case "ArrowUp": setActive(active - 1); break;
			case "Tab": if (evt.shiftKey) return; accept(); break;
			case "Enter": accept(); break;
			case "Escape": isHeld = true; close(); break;
			default: return;
		}
		evt.preventDefault();
		evt.stopImmediatePropagation();
	}, true);

	// Keep focus in the search box, and keep upstream's body click from closing the results.
	menu.addEventListener("pointerdown", evt => evt.preventDefault());
	menu.addEventListener("click", evt => {
		evt.stopPropagation();
		const opt = evt.target.closest("[role=option]");
		if (opt) accept([...menu.children].indexOf(opt));
	});
};

if (typeof document !== "undefined") initMenu();
