// GENERATED — do not edit directly; edit src/lib/site-browser/ and run: npm run scripts:bundle
(function() {


//#region src/lib/site-browser/transport.js
	const HTTP_PREFIX = "/_hm-site-browser/";
	const invoke = async (cmd, args) => {
		if (typeof window !== "undefined" && window.__TAURI_INTERNALS__?.invoke) return window.__TAURI_INTERNALS__.invoke(`plugin:site-browser|${cmd}`, args);
		const res = await fetch(`${HTTP_PREFIX}${cmd}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(args ?? {})
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(text || `Site browser request failed (${res.status})`);
		}
		return res.json();
	};
	const toast = (content, type = "info") => {
		if (typeof JqueryUtil !== "undefined") JqueryUtil.doToast({
			content,
			type
		});
	};
	const notReadyMessage = (status) => status.connected ? "This world's Homebrew Manager Bridge module is too old to receive sends. Update it from the manager and reload the world." : "No Foundry world is connected. Open your world as a GM, then try again.";
	const markPage = (status) => {
		const root = document.documentElement;
		if (root) root.dataset.hbmFoundry = status.canSend ? "on" : "off";
	};
	const pollStatus = async (state, invokeFn = invoke) => {
		if (document.hidden) return;
		try {
			state.status = await invokeFn("status");
		} catch {
			state.status = {
				canSend: false,
				connected: false
			};
		}
		markPage(state.status);
	};
	const sendPackets = async (targetUuid, name, packets, invokeFn = invoke, toastFn = toast) => {
		try {
			const { sent, failed } = await invokeFn("send", {
				targetUuid,
				packets
			});
			if (failed?.length) toastFn(`Sent ${sent} to ${name}. Could not send: ${failed.map((f) => f.name).join(", ")}.`, "warning");
			else toastFn(`Sent ${packets.length > 1 ? `${packets.length} entries` : "it"} to ${name}.`, "success");
		} catch (err) {
			toastFn(`Could not send to Foundry: ${err?.message ?? err}`, "danger");
		}
	};

//#endregion
//#region src/lib/site-browser/blocklist.js
	const toRule = ({ displayName, hash, category, source }) => ({
		displayName: String(displayName ?? hash ?? ""),
		hash: String(hash ?? ""),
		category: String(category ?? ""),
		source: String(source?.source ?? source ?? ""),
		isAuto: false
	});
	const createBlocklistBridge = ({ batchMs = 250, invokeFn = invoke, toastFn = toast } = {}) => {
		let blockQueue = [];
		let blockTimer = null;
		const flushBlocked = async () => {
			const entries = blockQueue;
			blockQueue = [];
			if (!entries.length) return;
			try {
				await invokeFn("blocklist_add", { entries });
				toastFn(`Also sent ${entries.length === 1 ? "it" : `${entries.length} rules`} to the manager's Choose Content page. Save there to keep.`, "success");
			} catch (err) {
				toastFn(`Could not send to the manager: ${err?.message ?? err}`, "danger");
			}
		};
		const queueBlocked = (rules) => {
			blockQueue.push(...rules.map(toRule).filter((r) => r.hash && r.category && r.source));
			clearTimeout(blockTimer);
			blockTimer = setTimeout(() => void flushBlocked(), batchMs);
		};
		const hookBlocklist = () => {
			const listPage = typeof ListPage === "undefined" ? null : ListPage.prototype;
			const original = listPage?._pDoMassBlocklist;
			if (original && !original.hbmHooked) {
				listPage._pDoMassBlocklist = async function(ents) {
					const result = await original.call(this, ents);
					queueBlocked((ents ?? []).filter(Boolean).map((ent) => ({
						displayName: ent._displayName || ent.name,
						hash: UrlUtil.autoEncodeHash(ent),
						category: ent.__prop,
						source: ent.source
					})));
					return result;
				};
				listPage._pDoMassBlocklist.hbmHooked = true;
			}
			const blocklistUi = typeof BlocklistUi === "undefined" ? null : BlocklistUi.prototype;
			const addExclude = blocklistUi?._addExclude;
			if (addExclude && !addExclude.hbmHooked) {
				blocklistUi._addExclude = function(displayName, hash, category, source) {
					const added = addExclude.call(this, displayName, hash, category, source);
					if (added) queueBlocked([{
						displayName,
						hash,
						category,
						source
					}]);
					return added;
				};
				blocklistUi._addExclude.hbmHooked = true;
			}
		};
		return {
			queueBlocked,
			flushBlocked,
			hookBlocklist
		};
	};

//#endregion
//#region src/lib/site-browser/picker.js
	const OPEN_GROUPS_KEY = "hm-foundry-open-groups";
	const GROUPS = [
		["character", "Player characters"],
		["party", "Parties"],
		["group", "Groups"],
		["encounter", "Encounters"]
	];
	const WORLD_DIRECTORY = {
		uuid: null,
		name: "World directory",
		blocked: false
	};
	const make = (tag, className, text) => {
		const element = document.createElement(tag);
		element.className = className;
		if (text != null) element.textContent = text;
		return element;
	};
	const button = (className) => {
		const element = make("button", className);
		element.type = "button";
		return element;
	};
	/** Folds case and accents, so "aria" finds "Áriá". */
	const fold = (text) => String(text).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
	/** Every word must appear somewhere in the name or folder. */
	const matches = ({ name, folder = "" }, query) => {
		const haystack = fold(`${name} ${folder ?? ""}`);
		return fold(query).split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
	};
	const loadOpenGroups = () => {
		try {
			return new Set(JSON.parse(localStorage.getItem("hm-foundry-open-groups") ?? "[]"));
		} catch {
			return /* @__PURE__ */ new Set();
		}
	};
	const saveOpenGroups = (open) => {
		try {
			localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...open]));
		} catch {}
	};
	/** Shared floating picker shell: viewport-clamped anchor, keyboard nav, outside-click close. */
	const mountPicker = ({ titleText, placeholder, anchor, onChoose, onClose, renderRows }) => {
		const root = make("div", "hm-target-picker ve-ui-ctx__wrp");
		const title = make("div", "hm-target-title", titleText);
		const search = make("input", "ve-form-control ve-input-xs");
		search.placeholder = placeholder;
		const list = make("div", "hm-target-list");
		root.append(title, search, list);
		let rows = [];
		let active = -1;
		const setActive = (index) => {
			if (rows[active]) delete rows[active].element.dataset.active;
			active = index;
			if (!rows[active]) return;
			rows[active].element.dataset.active = "true";
			rows[active].element.scrollIntoView({ block: "nearest" });
		};
		const place = () => {
			const { width, height } = root.getBoundingClientRect();
			const margin = 8;
			const x = Math.min(anchor.x, window.innerWidth - width - margin);
			const y = Math.min(anchor.y, window.innerHeight - height - margin);
			root.style.insetInlineStart = `${Math.max(x, margin)}px`;
			root.style.insetBlockStart = `${Math.max(y, margin)}px`;
		};
		const onOutside = (evt) => {
			if (!root.contains(evt.target)) close();
		};
		function close() {
			window.removeEventListener("pointerdown", onOutside, true);
			root.remove();
			onClose?.(close);
		}
		const choose = (target) => {
			close();
			onChoose(target);
		};
		function render() {
			const query = search.value.trim();
			list.replaceChildren();
			rows = [];
			active = -1;
			renderRows({
				query,
				list,
				search,
				render,
				choose,
				registerRow: (element, target) => rows.push({
					element,
					target
				}),
				rowCount: () => rows.length
			});
			if (query) setActive(rows.length ? 0 : -1);
			place();
		}
		search.addEventListener("input", render);
		search.addEventListener("keydown", (evt) => {
			evt.stopPropagation?.();
			if (evt.key === "Escape") close();
			else if (evt.key === "Enter") {
				evt.preventDefault?.();
				if (rows[active]) choose(rows[active].target);
			} else if (rows.length && (evt.key === "ArrowDown" || evt.key === "ArrowUp")) {
				evt.preventDefault?.();
				const step = evt.key === "ArrowDown" ? 1 : -1;
				setActive(((active === -1 && step === -1 ? 0 : active) + step + rows.length) % rows.length);
			}
		});
		window.addEventListener("pointerdown", onOutside, true);
		document.body.append(root);
		render();
		search.focus();
		return {
			root,
			title,
			close
		};
	};
	const showTargetPicker = (targets, batch, { anchor, onChoose, onClose }) => {
		const open = loadOpenGroups();
		const titleFor = () => batch.length > 1 ? `Send ${batch.length} entries to` : "Send to";
		const mounted = mountPicker({
			titleText: titleFor(),
			placeholder: "Search actors and folders…",
			anchor,
			onChoose,
			onClose,
			renderRows: ({ query, list, search, render, choose, registerRow }) => {
				const addRow = (target, isIndented) => {
					const row = button(`hm-target-row ve-ui-ctx__btn${isIndented ? " hm-target-row-indented" : ""}`);
					row.append(make("span", "hm-target-name", target.name));
					if (target.folder) row.append(make("span", "hm-target-folder", target.folder));
					row.disabled = !!target.blocked;
					if (target.blocked) row.title = `${target.name} can't hold this.`;
					row.addEventListener("click", () => choose(target));
					list.append(row);
					if (!target.blocked) registerRow(row, target);
				};
				const addGroupHead = (kind, label, count, isOpen) => {
					const head = button("hm-target-group-head ve-ui-ctx__btn");
					const text = make("span", "hm-target-name");
					text.append(make("span", "hm-target-chevron", isOpen ? "▾" : "▸"), make("span", "", label));
					head.append(text, make("span", "hm-target-count", count));
					head.addEventListener("click", () => {
						if (open.has(kind)) open.delete(kind);
						else open.add(kind);
						saveOpenGroups(open);
						render();
						search.focus();
					});
					list.append(head);
				};
				if (matches(WORLD_DIRECTORY, query)) addRow(WORLD_DIRECTORY, false);
				for (const [kind, label] of GROUPS) {
					const inGroup = targets.filter((t) => t.kind === kind && matches(t, query));
					if (!inGroup.length) continue;
					const isOpen = !!query || open.has(kind);
					addGroupHead(kind, label, inGroup.length, isOpen);
					if (isOpen) inGroup.forEach((target) => addRow(target, true));
				}
				if (!list.children.length) list.append(make("div", "hm-target-empty", "No matches"));
			}
		});
		return {
			updateTitle: () => {
				mounted.title.textContent = titleFor();
			},
			close: mounted.close
		};
	};
	/** Pick a shop to add to, or type a new shop's name. */
	const showShopPicker = (shops, entries, { anchor, onChoose, onClose }) => {
		return mountPicker({
			titleText: entries.length > 1 ? `Add ${entries.length} entries to a shop` : "Add to a shop",
			placeholder: "Search shops, or name a new one…",
			anchor,
			onChoose,
			onClose,
			renderRows: ({ query, list, choose, registerRow, rowCount }) => {
				const addRow = (label, detail, target) => {
					const row = button("hm-target-row ve-ui-ctx__btn");
					row.append(make("span", "hm-target-name", label));
					if (detail) row.append(make("span", "hm-target-count", detail));
					row.addEventListener("click", () => choose(target));
					list.append(row);
					registerRow(row, target);
				};
				const found = shops.filter((shop) => matches(shop, query));
				const exact = shops.some((shop) => fold(shop.name) === fold(query));
				if (query && !exact) addRow(`New shop “${query}”`, "", { name: query });
				for (const shop of found) addRow(shop.name, shop.count, { file: shop.file });
				if (!rowCount()) list.append(make("div", "hm-target-empty", "No shops yet. Type a name to make one."));
			}
		}).close;
	};

//#endregion
//#region src/lib/site-browser/shops.js
	const SHOP_PAGES = new Set(["items.html", "spells.html"]);
	const currentPage = () => typeof UrlUtil !== "undefined" && typeof UrlUtil.getCurrentPage === "function" ? UrlUtil.getCurrentPage() : "";
	const isShopPage = () => SHOP_PAGES.has(currentPage());
	const isSpellsPage = () => currentPage() === "spells.html";
	/**
	* A shop entry: the site's hash and count, plus what it shows for the manager.
	* @param {any} entity
	* @param {number} [count]
	* @param {any} [listPage]
	*/
	const toShopEntry = (entity, count = 1, listPage = null) => {
		const entry = {
			h: UrlUtil.autoEncodeHash(entity),
			c: count,
			name: String(entity._displayName || entity.name || ""),
			source: String(entity.source ?? "")
		};
		const customHashId = listPage?._sublistManager?._getCustomHashId?.({ entity });
		if (customHashId) entry.customHashId = String(customHashId);
		if (isSpellsPage()) {
			entry.page = "spells.html";
			if (Number.isInteger(entity.level)) entry.level = entity.level;
		} else if (typeof entity.value === "number") entry.value = entity.value;
		return entry;
	};
	const shownEntries = (listPage) => {
		const entity = listPage?._lastRender?.entity;
		return entity ? [toShopEntry(entity, 1, listPage)] : [];
	};
	const pinnedEntries = (listPage) => (listPage?._sublistManager?.getSublistedEntityMetas?.() ?? []).map(({ entity, count }) => toShopEntry(entity, count ?? 1, listPage));
	const addToShop = async (target, entries, invokeFn = invoke, toastFn = toast) => {
		try {
			const added = await invokeFn("shop_add", {
				...target,
				entries
			});
			toastFn(`Added ${entries.length === 1 ? entries[0].name || "it" : `${entries.length} entries`} to ${added.name} in the manager.`, "success");
		} catch (err) {
			toastFn(`Could not add to the shop: ${err?.message ?? err}`, "danger");
		}
	};
	const openShopPicker = async (entries, showShopPicker, invokeFn = invoke, toastFn = toast) => {
		if (!entries.length) return;
		let shops;
		try {
			shops = await invokeFn("shop_list");
		} catch (err) {
			toastFn(`Could not read the manager's shops: ${err?.message ?? err}`, "danger");
			return;
		}
		showShopPicker(shops, entries);
	};

//#endregion
//#region src/lib/site-browser/styles.js
	const SEND_BUTTON = "button[title^=\"Send to Foundry\"]";
	const LIST_RELOAD_BUTTON = "button[title=\"Reload Pinned List\"]";
	const PINNED_ROW = "#sublist .ve-lst__row";
	const CARD_SEND_SOURCE = `#pagecontent ${SEND_BUTTON}`;
	const SITE_CARD_SEND = ".detail-bar-send-to-foundry";
	const CARD_MENU_ICON = "#tabs-right .glyphicon-option-vertical";
	const SHOP_ICON = `<span class="glyphicon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12l1.5 4a2 2 0 0 1-3.75.9 2 2 0 0 1-3.75 0 2 2 0 0 1-3.75 0A2 2 0 0 1 .5 6zM2 8.5V14h12V8.5M6.5 14v-3.5h3V14"/></svg></span>`;
	const STYLES = `
  /* ── Site Browser - Disabled Send Buttons ───────────────────────────────── */
  html[data-hm-foundry="off"] ${SEND_BUTTON} {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Site Browser - Send And Clear Buttons ──────────────────────────────── */
  .hm-list-actions {
    flex-shrink: 0;
    margin-inline-start: 0.4rem;
  }

  /* ── Site Browser - Item Card Send Button ───────────────────────────────── */
  /* Only on a site without its own card send button. After the site's buttons. */
  .hm-send-card {
    order: 1;
  }
  :where(html:has(.hm-send-card)) #pagecontent ${SEND_BUTTON} {
    display: none;
  }

  /* ── Site Browser - Add To Shop Buttons ─────────────────────────────────── */
  .hm-add-shop svg {
    display: inline-block;
    inline-size: 1em;
    block-size: 1em;
    vertical-align: -0.125em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linejoin: round;
  }

  /* ── Target Picker - Layout ─────────────────────────────────────────────── */
  /* The site sets its root font to 10px, so 1rem here is 10px. */
  .hm-target-picker {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    inline-size: 36rem;
    max-block-size: min(80vh, 56rem);
    padding: 0.8rem;
  }
  .hm-target-title {
    padding-inline: 0.8rem;
    font-weight: bold;
  }
  .hm-target-list {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
  }

  /* ── Target Picker - Rows ───────────────────────────────────────────────── */
  /* In :where() so the site's menu classes win on color and hover. */
  :where(.hm-target-row, .hm-target-group-head) {
    display: flex;
    flex-shrink: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: 1.2rem;
    inline-size: 100%;
    padding-block: 0.4rem;
    padding-inline: 0.8rem;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
  }
  .hm-target-group-head {
    font-weight: bold;
  }
  .hm-target-chevron {
    display: inline-block;
    inline-size: 1.6rem;
  }
  .hm-target-row-indented {
    padding-inline-start: 2.4rem;
  }
  .hm-target-name,
  .hm-target-folder {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hm-target-folder,
  .hm-target-count,
  .hm-target-empty {
    opacity: 0.6;
  }
  .hm-target-folder {
    flex-shrink: 1;
    font-size: 0.85em;
  }
  .hm-target-empty {
    padding: 0.8rem;
  }

  /* ── Target Picker - States ─────────────────────────────────────────────── */
  .hm-target-row:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .hm-target-row[data-active] {
    outline: 0.0625rem solid currentColor;
    outline-offset: -0.0625rem;
  }
`;

//#endregion
//#region src/lib/site-browser/dom-hooks.js
	const createDomHooks = ({ state, onOpenShopPicker }) => {
		const pressListMenuItem = (label) => {
			const row = document.querySelector(`${"#sublist .ve-lst__row"}.list-multi-selected`) ?? document.querySelector("#sublist .ve-lst__row");
			if (!row) return;
			const anchor = state.lastClick;
			row.dispatchEvent(new MouseEvent("contextmenu", {
				bubbles: true,
				cancelable: true,
				view: window
			}));
			const item = [...document.querySelectorAll(".ve-ui-ctx__btn")].find((btn) => btn.textContent === label);
			if (item) item.click();
			else toast(`Could not find the site's "${label}" action.`, "danger");
			state.lastClick = anchor;
		};
		const clearPinnedList = async () => {
			const count = document.querySelectorAll(PINNED_ROW).length;
			if (await InputUiUtil.pGetUserBoolean({
				title: "Clear Pinned List",
				htmlDescription: `Remove ${count === 1 ? "the 1 entry" : `all ${count} entries`} from this list?`,
				textYes: "Clear",
				textNo: "Cancel"
			})) pressListMenuItem("Clear List");
		};
		const makeListActions = () => {
			const actions = make("div", "hm-list-actions ve-btn-group");
			actions.dataset.hbmListActions = "true";
			const send = button("hm-send-foundry ve-btn ve-btn-5et ve-btn-xs ve-btn-primary");
			send.title = "Send to Foundry (all pinned entries)";
			send.append(make("span", "glyphicon glyphicon-send"));
			send.addEventListener("click", () => pressListMenuItem("Send to Foundry"));
			const clear = button("ve-btn ve-btn-5et ve-btn-xs ve-btn-default");
			clear.title = "Clear Pinned List";
			clear.append(make("span", "glyphicon glyphicon-remove"));
			clear.addEventListener("click", () => void clearPinnedList());
			actions.append(send, clear);
			if (isShopPage()) {
				const shop = button("hm-add-shop ve-btn ve-btn-5et ve-btn-xs ve-btn-default");
				shop.title = "Add everything in this list to a Shop";
				shop.innerHTML = SHOP_ICON;
				shop.addEventListener("click", () => void onOpenShopPicker(pinnedEntries(state.listPage)));
				actions.append(shop);
			}
			return actions;
		};
		const addListActions = () => {
			const hasPins = !!document.querySelector(PINNED_ROW);
			for (const reload of document.querySelectorAll(LIST_RELOAD_BUTTON)) {
				const group = reload.parentElement;
				let actions = group.nextElementSibling;
				if (!actions?.dataset?.hbmListActions) {
					actions = makeListActions();
					group.after(actions);
				}
				for (const btn of actions.children) btn.disabled = !hasPins;
			}
		};
		const sendCard = (evt) => {
			const source = document.querySelector(CARD_SEND_SOURCE);
			if (!source) return;
			const anchor = state.lastClick;
			source.dispatchEvent(new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				view: window,
				shiftKey: !!evt.shiftKey
			}));
			state.lastClick = anchor;
		};
		const addCardSend = () => {
			const tabs = document.getElementById("tabs-right");
			if (!tabs) return;
			let send = document.querySelector(".hm-send-card");
			if (document.querySelector(".detail-bar-send-to-foundry")) {
				send?.remove();
				return;
			}
			if (!send) {
				send = button("hm-send-card hm-send-foundry ve-ui-tab__btn-tab-head ve-btn ve-btn-default ve-pt-2p ve-px-4p ve-pb-0 ve-w-24p");
				send.title = "Send to Foundry (SHIFT for Temporary Import)";
				send.append(make("span", "glyphicon glyphicon-send"));
				send.addEventListener("click", sendCard);
				tabs.append(send);
			}
			send.disabled = !document.querySelector(CARD_SEND_SOURCE);
		};
		const addCardShop = () => {
			const tabs = document.getElementById("tabs-right");
			if (!tabs || !isShopPage()) return;
			let shop = document.querySelector(".hm-add-shop-card");
			if (!shop) {
				shop = button("hm-add-shop hm-add-shop-card ve-ui-tab__btn-tab-head ve-btn ve-btn-default ve-pt-2p ve-px-4p ve-pb-0 ve-w-24p");
				shop.title = "Add to a shop in the manager";
				shop.innerHTML = SHOP_ICON;
				shop.addEventListener("click", () => void onOpenShopPicker(shownEntries(state.listPage)));
				tabs.append(shop);
			}
			const menu = document.querySelector(CARD_MENU_ICON)?.parentElement;
			if (menu && menu.previousElementSibling !== shop) menu.before(shop);
			shop.disabled = !state.listPage?._lastRender?.entity;
		};
		const decoratePage = () => {
			addListActions();
			addCardSend();
			addCardShop();
		};
		const hookListPage = () => {
			const proto = typeof ListPage === "undefined" ? null : ListPage.prototype;
			const original = proto?.pDoLoadHash;
			if (!original || original.hbmHooked) return;
			proto.pDoLoadHash = function(...args) {
				state.listPage = this;
				return original.apply(this, args).finally(decoratePage);
			};
			proto.pDoLoadHash.hbmHooked = true;
		};
		return {
			hookListPage,
			decoratePage,
			pressListMenuItem,
			clearPinnedList,
			sendCard
		};
	};

//#endregion
//#region src/lib/site-browser/index.js
	const POLL_MS = 3e3;
	const BATCH_MS = 250;
	const TARGETED_TYPES = new Set([
		"entity",
		"currency",
		"5etools.lootgen.loot"
	]);
	const state = {
		status: {
			canSend: false,
			connected: false
		},
		lastClick: null,
		pending: [],
		batchTimer: null,
		gathering: false,
		picker: null,
		/** Closes the open shop picker. Apart from the send picker, which owns `picker`. */
		shopPicker: null,
		listPage: null
	};
	const clickAnchor = () => ({
		x: state.lastClick?.clientX ?? 8,
		y: state.lastClick?.clientY ?? 8
	});
	const blocklist = createBlocklistBridge({ batchMs: BATCH_MS });
	const launchShopPicker = (shops, entries) => {
		state.shopPicker?.();
		state.shopPicker = showShopPicker(shops, entries, {
			anchor: clickAnchor(),
			onChoose: (target) => void addToShop(target, entries),
			onClose: (closer) => {
				if (state.shopPicker === closer) state.shopPicker = null;
			}
		});
	};
	const domHooks = createDomHooks({
		state,
		onOpenShopPicker: (entries) => openShopPicker(entries, launchShopPicker)
	});
	const gatherDone = async () => {
		const batch = state.pending;
		let targets;
		try {
			const summaries = batch.map(({ type, data }) => ({
				type,
				page: data?.page
			}));
			({targets} = await invoke("targets", { packets: summaries }));
		} catch (err) {
			state.gathering = false;
			state.pending = [];
			toast(`Could not read the world's actors: ${err?.message ?? err}`, "danger");
			return;
		}
		if (targets.every((t) => t.blocked)) {
			state.gathering = false;
			state.pending = [];
			sendPackets(null, "the world directory", batch);
			return;
		}
		state.picker = showTargetPicker(targets, batch, {
			anchor: clickAnchor(),
			onChoose: (target) => void sendPackets(target.uuid, target.uuid ? target.name : "the world directory", batch),
			onClose: () => {
				state.picker = null;
				state.gathering = false;
				state.pending = [];
			}
		});
	};
	const onReady = () => {
		window.dispatchEvent(new CustomEvent("rivet.active"));
		markPage(state.status);
		blocklist.hookBlocklist();
		domHooks.hookListPage();
		const style = document.createElement("style");
		style.textContent = STYLES;
		document.head.append(style);
		domHooks.decoratePage();
		new MutationObserver(domHooks.decoratePage).observe(document.body, {
			childList: true,
			subtree: true
		});
	};
	window.addEventListener("click", (evt) => {
		state.lastClick = evt;
		if (state.status.canSend || !evt.target?.closest?.("button[title^=\"Send to Foundry\"]")) return;
		evt.preventDefault();
		evt.stopPropagation();
		toast(notReadyMessage(state.status), "warning");
	}, true);
	window.addEventListener("rivet.send", (evt) => {
		const packet = evt.detail;
		if (!packet || packet.type === "roll") return;
		if (!state.status.canSend) {
			toast(notReadyMessage(state.status), "warning");
			return;
		}
		if (!TARGETED_TYPES.has(packet.type) || packet.data?.isTemp) {
			sendPackets(null, "Foundry", [packet]);
			return;
		}
		state.pending.push(packet);
		state.picker?.updateTitle();
		if (state.gathering) return;
		clearTimeout(state.batchTimer);
		state.batchTimer = setTimeout(() => {
			state.gathering = true;
			gatherDone();
		}, BATCH_MS);
	});
	let extensionUtil;
	Object.defineProperty(globalThis, "ExtensionUtil", {
		configurable: true,
		get: () => extensionUtil,
		set: (value) => {
			extensionUtil = value;
			value.ACTIVE = true;
		}
	});
	document.addEventListener("DOMContentLoaded", onReady);
	pollStatus(state);
	setInterval(() => void pollStatus(state), POLL_MS);

//#endregion
})();
