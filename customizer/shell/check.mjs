// Loads pages in headless Chrome at several widths. Reports script errors, failed
// local requests and sideways overflow, and can save screenshots.
//   node shell/check.mjs [--pages=spells,items] [--widths=1920,1280,800,390] [--shots=dir] [--scheme=light|dark] [--theme=day|night] [--settle=ms] [--flows]
import {spawn} from "node:child_process";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import {siteRoot} from "../scripts/paths.mjs";

const args = Object.fromEntries(process.argv.slice(2).map(a => {
	const [key, value = "true"] = a.replace(/^--/, "").split("=");
	return [key, value];
}));
const base = args.base || "http://localhost:5175/";
const widths = (args.widths || "1920,1280,800,390").split(",").map(Number);
const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// Extra wait after the page and its list are ready, for late layout.
const settle = Number(args.settle || 300);

const allPages = async () => (await fs.readdir(siteRoot()))
	.filter(f => f.endsWith(".html")).map(f => f.replace(/\.html$/, ""));
const pages = args.pages !== undefined ? args.pages.split(",").filter(Boolean) : await allPages();
if (args.shots) await fs.mkdir(args.shots, {recursive: true});

const profile = await fs.mkdtemp(path.join(os.tmpdir(), "shell-check-"));
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], {stdio: ["ignore", "ignore", "pipe"]});
const wsUrl = await new Promise((ok, no) => {
	let buf = ""; proc.stderr.on("data", d => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) ok(m[0]); });
	setTimeout(() => no(new Error("Chrome didn't start")), 20000);
});
const ws = new WebSocket(wsUrl);
await new Promise(ok => ws.addEventListener("open", ok));
let id = 0; const waiting = new Map(), listeners = new Set();
ws.addEventListener("message", e => {
	const m = JSON.parse(e.data);
	if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else listeners.forEach(l => l(m));
});
const send = (method, params = {}, sessionId) => new Promise(ok => { const i = ++id; waiting.set(i, ok); ws.send(JSON.stringify({id: i, method, params, sessionId})); });
const sleep = ms => new Promise(ok => setTimeout(ok, ms));

const {result: {targetId}} = await send("Target.createTarget", {url: "about:blank"});
const {result: {sessionId}} = await send("Target.attachToTarget", {targetId, flatten: true});
const s = (m, p) => send(m, p, sessionId);
await s("Page.enable"); await s("Runtime.enable"); await s("Network.enable");

let problems = [], failures = 0;
listeners.add(m => {
	if (m.sessionId !== sessionId) return;
	// js/index.js expects elements the customized home page removed, which is not a shell fault.
	if (m.method === "Runtime.exceptionThrown" && !JSON.stringify(m.params.exceptionDetails).includes("/js/index.js")) problems.push(`exception: ${(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]}`);
	if (m.method === "Network.responseReceived" && m.params.response.status >= 400 && m.params.response.url.startsWith(base) && !/\/sw\.js|favicon/.test(m.params.response.url)) problems.push(`${m.params.response.status}: ${m.params.response.url.replace(base, "")}`);
});
if (args.scheme) await s("Emulation.setEmulatedMedia", {features: [{name: "prefers-color-scheme", value: args.scheme}]});
// The site starts in night mode whatever the system scheme, so day screenshots need the stored setting.
if (args.theme) await s("Page.addScriptToEvaluateOnNewDocument", {source: `localStorage.setItem("StyleSwitcher_style", ${JSON.stringify(args.theme)})`});

const measure = `(() => {
	const de = document.documentElement, vw = de.clientWidth;
	// Walking every element is slow on big list pages; only do it when there's overflow to explain.
	const wide = de.scrollWidth <= vw + 1 ? [] : [...document.querySelectorAll("body *")].filter(el => {
		const r = el.getBoundingClientRect();
		if (!r.width || r.right <= vw + 1) return false;
		for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(p).overflowX)) return false;
		return true;
	}).slice(0, 3).map(el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && el.className.split ? "." + el.className.split(" ")[0] : ""));
	return JSON.stringify({scroll: de.scrollWidth, vw, wide, rows: document.querySelectorAll(".list--stats > *").length});
})()`;

const evaluate = async expression => {
	const {result} = await s("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
	if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
	return result.result.value;
};
// Lists load large JSON, so wait on the state itself. A fixed delay fails on a busy machine.
const until = async (expression, timeout = 30000) => {
	const end = Date.now() + timeout;
	while (Date.now() < end) {
		if (await evaluate(expression).catch(() => false)) return true;
		await sleep(150);
	}
	return false;
};

for (const page of pages) for (const width of widths) {
	problems = [];
	await s("Emulation.setDeviceMetricsOverride", {width, height: width < 600 ? 844 : 1000, deviceScaleFactor: 1, mobile: false});
	const nav = await s("Page.navigate", {url: `${base}${page}.html${args.hash || ""}`});
	// A page that never loaded has no errors or overflow to report, so it must not pass.
	if (nav.result?.errorText) problems.push(`failed to load: ${nav.result.errorText}`);
	// Wait for the page, then for its list if it has one, instead of a fixed delay per page.
	await sleep(200);
	await until(`document.readyState === "complete"`, 15000);
	if (await evaluate(`!!document.querySelector(".list--stats")`).catch(() => false)
		&& !await until(`document.querySelectorAll(".list--stats > *").length > 0`, 15000)) problems.push("list never loaded");
	await sleep(settle);
	const {result} = await s("Runtime.evaluate", {expression: measure, returnByValue: true});
	const m = JSON.parse(result.result.value);
	if (m.scroll > m.vw + 1) problems.push(`overflow ${m.scroll}>${m.vw}: ${m.wide.join(", ")}`);
	if (args.shots) {
		const {result: shot} = await s("Page.captureScreenshot", {format: "png"});
		await fs.writeFile(path.join(args.shots, `${page}-${width}.png`), Buffer.from(shot.data, "base64"));
	}
	const uniq = [...new Set(problems)];
	if (uniq.length) failures++;
	console.log(`${uniq.length ? "FAIL" : "ok  "} ${page} @${width} rows=${m.rows}${uniq.length ? "\n     " + uniq.slice(0, 6).join("\n     ") : ""}`);
}
// Click-through checks. These cover behaviour the shell could break without any error.
const shot = async name => {
	if (!args.shots) return;
	const {result} = await s("Page.captureScreenshot", {format: "png"});
	await fs.writeFile(path.join(args.shots, `${name}.png`), Buffer.from(result.data, "base64"));
};
const visible = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.right <= innerWidth + 1 && r.top < innerHeight; })()`;
const flow = async (name, fn) => {
	problems = [];
	try { const failed = await fn(); if (failed) problems.push(failed); } catch (e) { problems.push(e.message.split("\n")[0]); }
	if (problems.length) failures++;
	console.log(`${problems.length ? "FAIL" : "ok  "} flow: ${name}${problems.length ? "\n     " + problems.slice(0, 4).join("\n     ") : ""}`);
};
const open = async (page, width) => {
	await s("Emulation.setDeviceMetricsOverride", {width, height: width < 600 ? 844 : 1000, deviceScaleFactor: 1, mobile: false});
	await s("Page.navigate", {url: `${base}${page}.html`});
	await sleep(300);
	if (!await until(`document.querySelectorAll(".list--stats > *").length > 5`)) throw new Error(`${page} list never loaded`);
	await sleep(800);
};
const clickText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.trim().startsWith(${JSON.stringify(text)})).click()`;
const runFlows = async () => {
	for (const width of [1600, 390]) {
		await flow(`row click shows that entry @${width}`, async () => {
			await open("spells", width);
			const name = await evaluate(`(() => { const a = document.querySelectorAll(".list--stats > *")[5].querySelector("a"); a.click(); return a.querySelector("span")?.textContent || a.textContent; })()`);
			const short = name.trim().slice(0, 6);
			await until(`(document.querySelector("#pagecontent")?.textContent || "").includes(${JSON.stringify(short)})`, 5000);
			const detail = await evaluate(`document.querySelector("#pagecontent")?.textContent || ""`);
			return detail.includes(short) ? null : `clicked "${short}", detail starts "${detail.trim().slice(0, 40)}"`;
		});
		await flow(`search narrows the list @${width}`, async () => {
			const n = await evaluate(`(async () => { const i = document.querySelector("#lst__search"); i.value = "fireball"; i.dispatchEvent(new Event("input", {bubbles: true})); i.dispatchEvent(new KeyboardEvent("keyup", {bubbles: true})); await new Promise(r => setTimeout(r, 900)); return document.querySelectorAll(".list--stats > *").length; })()`);
			return n > 0 && n < 50 ? null : `${n} rows after searching`;
		});
		await flow(`filter dialog opens inside the window @${width}`, async () => {
			await open("spells", width);
			await evaluate(clickText("button", "Filter"));
			await sleep(1000);
			await shot(`flow-filter-${width}`);
			return await evaluate(visible(".ve-fltr__btn-close")) ? null : "Save/Cancel not on screen";
		});
		await flow(`pinning adds a sublist and the list still scrolls @${width}`, async () => {
			await open("spells", width);
			await evaluate(`document.querySelectorAll(".list--stats > *")[2].querySelector("a").click()`);
			await sleep(500);
			// Pins persist in storage between runs, so check the count changed rather than that it's non-zero.
			const before = await evaluate(`document.querySelectorAll("#sublist > *").length`);
			await evaluate(`document.querySelector("#tabs-right .glyphicon-pushpin").closest("button, .ve-btn").click()`);
			await sleep(600);
			await shot(`flow-pinned-${width}`);
			const rows = await evaluate(`document.querySelectorAll("#sublist > *").length`);
			const scrolls = await evaluate(`(() => { const l = document.querySelector(".list--stats"); l.scrollTop = 200; return l.scrollTop > 0; })()`);
			return rows !== before && scrolls ? null : `sublist rows ${before} to ${rows}, list scrolls ${scrolls}`;
		});
	}
	// Classes: the header, the subclass row under the bar, and the list collapsing on phones.
	const pickClass = name => `(() => { const r = [...document.querySelectorAll(".list--stats > *")].find(e => e.querySelector("span")?.textContent.trim() === ${JSON.stringify(name)}); r?.querySelector("a").click(); return !!r; })()`;
	const classState = `JSON.stringify({
		h1: document.querySelector("#classheader h1")?.textContent,
		altName: document.querySelector(".classes-header-alt-name")?.textContent,
		chips: document.querySelectorAll("#subclasschips .classes-subclass-chips > .ve-btn").length,
		railOpen: document.querySelector("#listcontainer").classList.contains("classes-rail-open"),
		rows: [...document.querySelectorAll(".list--stats > *")].filter(e => e.getBoundingClientRect().height > 2).length,
	})`;
	await flow("classes: a pick updates the header and the subclass row @1600", async () => {
		await open("classes", 1600);
		await evaluate(pickClass("Bard"));
		await until(`document.querySelector("#classheader h1")?.textContent === "Bard"`, 5000);
		const st = JSON.parse(await evaluate(classState));
		return st.h1 === "Bard" && st.chips > 10 ? null : `header "${st.h1}", ${st.chips} subclass toggles under the bar`;
	});
	await flow("classes: a subclass toggle turns on @1600", async () => {
		const before = await evaluate(`location.hash`);
		await evaluate(`document.querySelector("#subclasschips .classes-subclass-chips > .ve-btn").click()`);
		await sleep(800);
		await shot("flow-classes-subclass-1600");
		const after = await evaluate(`location.hash`);
		return after !== before ? null : "hash unchanged after clicking a subclass";
	});
	await flow("classes: Book View is hidden @1600", async () => {
		return await evaluate(`document.querySelector("#btn-readmode")?.getBoundingClientRect().width > 0`) ? "Book View still visible" : null;
	});
	await flow("classes: Compare Subclasses lays subclasses side by side and back @1600", async () => {
		await open("classes", 1600);
		await evaluate(pickClass("Rogue"));
		await until(`document.querySelector("#classheader h1")?.textContent === "Rogue"`, 5000);
		await evaluate(`[...document.querySelectorAll("#subclasschips .classes-subclass-chips > .ve-btn")].slice(0, 3).forEach(b => b.click())`);
		await sleep(800);
		const order = `[...document.querySelectorAll("#pagecontent tr")].map(tr => tr.getAttribute("data-subclass-id") || tr.getAttribute("data-scroll-id") || "").join("|")`;
		const before = await evaluate(order);
		await evaluate(`document.querySelector("#btn-comparemode").click()`);
		await sleep(800);
		await shot("flow-classes-compare-1600");
		const st = JSON.parse(await evaluate(`JSON.stringify((() => {
			const run = document.querySelector(".classes-compare-run:not([hidden])");
			const strip = run?.querySelector(".classes-compare-strip");
			return {
				cols: run?.dataset.count,
				tabs: run?.querySelectorAll(".classes-compare-tab:not([hidden])").length,
				scrolls: strip ? strip.scrollWidth > strip.clientWidth : false,
				textWidth: document.querySelector("#pagecontent tr[data-scroll-id] > td").getBoundingClientRect().width,
				cardWidth: document.querySelector(".classes-main").clientWidth,
			};
		})())`));
		const lastTab = `[...document.querySelector(".classes-compare-run:not([hidden])").querySelectorAll(".classes-compare-tab:not([hidden])")].at(-1)`;
		await evaluate(`${lastTab}.click()`);
		await sleep(1000);
		const scrolled = await evaluate(`document.querySelector(".classes-compare-run:not([hidden]) .classes-compare-strip").scrollLeft > 0 && ${lastTab}.getAttribute("aria-selected") === "true"`);
		await evaluate(`document.querySelector("#btn-comparemode").click()`);
		await sleep(800);
		const after = await evaluate(order);
		if (st.cols !== "3" || st.tabs !== 3) return `${st.cols} columns, ${st.tabs} tabs`;
		if (!st.scrolls) return "strip doesn't scroll sideways";
		// The class text keeps its line length; only the strips get the card's full width.
		if (st.textWidth > st.cardWidth * 0.8) return `class text is ${st.textWidth}px of a ${st.cardWidth}px card`;
		if (!scrolled) return "the last tab didn't scroll to its column";
		return after === before ? null : "rows not back in their original order";
	});
	await flow("classes: the source summary toggle shows source pills @1600", async () => {
		const count = `[...document.querySelectorAll(".ve-fltr__mini-pill")].filter(e => e.getBoundingClientRect().width > 0).length`;
		const btn = `document.querySelector('[title="Toggle Source Filter Summary"]')`;
		// Saved filter state carries over between runs, so start from the toggle being off.
		if (!await evaluate(`${btn}.querySelector(".glyphicon-bookmark-slash") !== null`)) { await evaluate(`${btn}.click()`); await sleep(500); }
		const before = await evaluate(count);
		await evaluate(`${btn}.click()`);
		await sleep(800);
		const after = await evaluate(count);
		await evaluate(`${btn}.click()`);
		return after > before ? null : `${before} pills visible before, ${after} after`;
	});
	await flow("classes: the header names an alternate class by its own text @1600", async () => {
		// Needs the local homebrew; there's nothing to check without it.
		if (!await evaluate(pickClass("Alternate Sorcerer"))) return null;
		await until(`document.querySelector(".classes-header-alt-name") !== null`, 5000);
		const st = JSON.parse(await evaluate(classState));
		return st.h1 === "The Sorcerer" && st.altName === "(Alternate Sorcerer)" ? null : `header "${st.h1}" "${st.altName}"`;
	});
	await flow("classes: the list collapses, opens and closes @390", async () => {
		await open("classes", 390);
		const start = JSON.parse(await evaluate(classState));
		await evaluate(`document.querySelector("#btn-classes-rail-toggle").click()`);
		await sleep(400);
		const opened = JSON.parse(await evaluate(classState));
		await evaluate(pickClass("Cleric"));
		await until(`document.querySelector("#classheader h1")?.textContent === "Cleric"`, 5000);
		await shot("flow-classes-390");
		const picked = JSON.parse(await evaluate(classState));
		if (start.railOpen || start.rows > 2) return `starts with ${start.rows} rows showing`;
		if (!opened.railOpen || opened.rows < 10) return `All classes shows ${opened.rows} rows`;
		return !picked.railOpen && picked.rows <= 2 ? null : `after a pick ${picked.rows} rows showing`;
	});
	await flow("list toggles show chevrons that turn when opened @1600", async () => {
		await open("races", 1600);
		const icons = `JSON.stringify([".ve-lst__btn-collapse-all-previews", ".list--stats > :first-child .ve-lst__btn-toggle-expand"].map(sel => getComputedStyle(document.querySelector(sel), "::before").content))`;
		const before = await evaluate(icons);
		await evaluate(`document.querySelector(".ve-lst__btn-collapse-all-previews").click()`);
		await sleep(500);
		await shot("flow-list-toggles-1600");
		const after = await evaluate(icons);
		await evaluate(`document.querySelector(".ve-lst__btn-collapse-all-previews").click()`);
		// chevron-right closed, chevron-down open.
		return before === JSON.stringify(["\"\"", "\"\""]) && after === JSON.stringify(["\"\"", "\"\""]) ? null : `closed ${before}, open ${after}`;
	});
	await flow("search suggests in: categories and Tab picks one @1600", async () => {
		await open("spells", 1600);
		// Types as a person would: real key events, so upstream's handlers see them too.
		await evaluate(`document.querySelector(".omni__input").focus()`);
		await s("Input.insertText", {text: "in:sp"});
		if (!await until(`document.querySelector(".omni-complete:popover-open .omni-complete-option")`, 15000)) return "no suggestion menu";
		await shot("flow-omni-complete-1600");
		const first = await evaluate(`document.querySelector(".omni-complete [aria-selected=true] .omni-complete-label").textContent`);
		await s("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
		await s("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
		await sleep(200);
		const after = await evaluate(`({value: document.querySelector(".omni__input").value, focused: document.activeElement?.classList.contains("omni__input"), open: !!document.querySelector(".omni-complete:popover-open")})`);
		return after.value === `in:${first} ` && after.focused && !after.open ? null : `picked "${first}", got ${JSON.stringify(after)}`;
	});
	await flow("search suggestions: Enter picks, then Enter searches @1600", async () => {
		await evaluate(`(() => { const i = document.querySelector(".omni__input"); i.value = ""; i.focus(); })()`);
		await s("Input.insertText", {text: "fireball source:xph"});
		if (!await until(`document.querySelector(".omni-complete:popover-open .omni-complete-option")`, 5000)) return "no source menu";
		const key = type => s("Input.dispatchKeyEvent", {type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: type === "keyDown" ? "\r" : undefined});
		await key("keyDown"); await key("keyUp");
		await sleep(200);
		const value = await evaluate(`document.querySelector(".omni__input").value`);
		if (!/^fireball source:\S+$/.test(value)) return `value after pick: "${value}"`;
		// The menu is closed now, so Enter goes to upstream and opens the first result.
		await key("keyDown"); await key("keyUp");
		return await until(`/fireball/i.test(location.hash) || /fireball/i.test(document.querySelector("#pagecontent")?.textContent || "")`, 5000) ? null : `Enter didn't open a result for "${value}"`;
	});
	await flow("search leaves a half-typed in: out of the results @1600", async () => {
		const type = async text => {
			await evaluate(`(() => { const i = document.querySelector(".omni__input"); i.value = ""; i.focus(); })()`);
			await s("Input.insertText", {text});
			// Upstream searches on keyup.
			await s("Input.dispatchKeyEvent", {type: "keyUp", key: "p", code: "KeyP", windowsVirtualKeyCode: 80});
			await sleep(800);
		};
		await type("in:");
		if (await evaluate(visible(".omni__wrp-output"))) return "results shown for a bare in:";
		await type("fireball in:sp");
		const names = await evaluate(`[...document.querySelectorAll(".omni__row-result")].map(r => r.textContent).join("|")`);
		return /fireball/i.test(names) ? null : `results for "fireball in:sp": ${names.slice(0, 120) || "none"}`;
	});
	await flow("nav menu opens on screen @1600", async () => {
		await open("spells", 1600);
		await evaluate(clickText(".page__btn-nav-root > a", "References"));
		await sleep(300);
		await shot("flow-nav-1600");
		return await evaluate(visible(".page__btn-nav-root.open .ve-dropdown-menu")) ? null : "menu not visible";
	});
	await flow("nav side menu loads books @1600", async () => {
		const n = await evaluate(`document.querySelectorAll(".page__btn-nav-root .ve-dropdown-menu--side li").length`);
		return n > 1 ? null : `${n} entries in side menus`;
	});
	await flow("nav menu button reveals links @390", async () => {
		await open("spells", 390);
		const before = await evaluate(visible(".page__btn-nav-root"));
		await evaluate(`document.querySelector(".page__btn-toggle-nav").click()`);
		await sleep(300);
		await evaluate(clickText(".page__btn-nav-root > a", "References"));
		await sleep(300);
		await shot("flow-nav-390");
		const after = await evaluate(visible(".page__btn-nav-root"));
		return !before && after ? null : `links visible before ${before}, after ${after}`;
	});
};
if (args.flows !== undefined) await runFlows();

ws.close(); proc.kill();
await fs.rm(profile, {recursive: true, force: true}).catch(() => {});
console.log(`${failures} failing page/width combination(s)`);
process.exit(failures ? 1 : 0);
