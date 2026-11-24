// node --test shell/modules-overlay.test.mjs
import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createOverlay} from "./modules-overlay.mjs";

const write = async (file, text) => {
	await fs.mkdir(path.dirname(file), {recursive: true});
	await fs.writeFile(file, text);
};

// A site, a data folder and four modules: a patch, a copy, CSS, and a reskin that replaces "theme".
const setup = async () => {
	const base = await fs.mkdtemp(path.join(os.tmpdir(), "overlay-"));
	const site = path.join(base, "site");
	const mods = path.join(base, "modules");
	const tools = path.join(base, "tools");
	const manager = path.join(base, "manager");
	await write(path.join(site, "js/a.js"), "const label = \"Species\";\n");
	await write(path.join(site, "css/main.css"), "body {}\n");
	await write(path.join(tools, "data.json"), "{\"from\": \"tools\"}");
	await write(path.join(mods, "rename/module.json"), JSON.stringify({
		title: "Rename", order: 10, defaultEnabled: true,
		entries: [{type: "patch", target: "js/a.js", patches: [{note: "Label", find: "\"Species\"", replace: "\"Ancestries\""}]}],
	}));
	await write(path.join(mods, "data/module.json"), JSON.stringify({
		title: "Data", order: 20, defaultEnabled: true,
		entries: [
			{type: "copy", source: "{data}/data.json", target: "data/extra.json"},
			{type: "copy", source: "{data}/gone.json", target: "data/gone.json", ifExists: true},
		],
	}));
	await write(path.join(mods, "theme/module.json"), JSON.stringify({title: "Theme", order: 30, defaultEnabled: true, css: "theme.css"}));
	await write(path.join(mods, "theme/theme.css"), ".theme {}\n");
	await write(path.join(mods, "styled/module.json"), JSON.stringify({title: "Styled", order: 40, defaultEnabled: true, css: "styled.css"}));
	await write(path.join(mods, "styled/styled.css"), ".styled {}\n");
	await write(path.join(mods, "reskin/module.json"), JSON.stringify({
		title: "Reskin the site", order: 1, replaces: ["theme"],
		entries: [{type: "diff", source: "reskin.patch"}],
	}));
	const configPath = path.join(base, "hbm-config.json");
	await write(configPath, "{}");
	return {site, mods, tools, manager, configPath, overlay: createOverlay({siteRoot: site, modulesDir: mods, configPath, dataDir: tools, managerDir: manager})};
};

test("a patch target is served patched", async () => {
	const {overlay} = await setup();
	const out = await overlay.serve("js/a.js");
	assert.equal(String(out.body), "const label = \"Ancestries\";\n");
	assert.deepEqual(out.warnings, []);
});

test("a copy target is served from its source", async () => {
	const {overlay} = await setup();
	assert.equal(String((await overlay.serve("data/extra.json")).body), "{\"from\": \"tools\"}");
});

test("the old {tools} token no longer resolves", async () => {
	const {overlay, mods} = await setup();
	await write(path.join(mods, "old/module.json"), JSON.stringify({
		title: "Old", order: 60, defaultEnabled: true,
		entries: [{type: "copy", source: "{tools}/data.json", target: "data/old.json"}],
	}));
	assert.equal(await overlay.serve("data/old.json"), null);
});

test("main.css gets the enabled modules' CSS, but not a replaced module's", async () => {
	const {overlay} = await setup();
	const css = String((await overlay.serve("css/main.css")).body);
	assert.match(css, /^body \{\}/);
	assert.match(css, /\/\* HBM Custom Styles \*\/\n\/\* Styled \*\/\n\.styled \{\}/);
	assert.doesNotMatch(css, /\.theme/);
});

test("a file no module touches is left to the server", async () => {
	const {overlay} = await setup();
	assert.equal(await overlay.serve("js/other.js"), null);
});

test("a module switched off in the config isn't applied", async () => {
	const {overlay, configPath} = await setup();
	await fs.writeFile(configPath, JSON.stringify({deploy: {modules: {rename: {enabled: false}}}}));
	assert.equal(await overlay.serve("js/a.js"), null);
});

test("a required anchor miss serves the file unpatched with one warning", async () => {
	const {overlay, site} = await setup();
	await fs.writeFile(path.join(site, "js/a.js"), "const label = \"Other\";\n");
	const out = await overlay.serve("js/a.js");
	assert.equal(String(out.body), "const label = \"Other\";\n");
	assert.equal(out.warnings.length, 1);
	assert.match(out.warnings[0], /Rename.*js\/a\.js — Label/);
	assert.deepEqual(overlay.warnings(), out.warnings);
});

test("a missing optional copy source is a plain 404, not a throw", async () => {
	const {overlay} = await setup();
	assert.equal(await overlay.serve("data/gone.json"), null);
});

test("a copy source can be a file inside a path option", async () => {
	const {overlay, mods, tools} = await setup();
	await write(path.join(tools, "pkg/site/css/extra.css"), ".pkg {}\n");
	await write(path.join(mods, "pkg/module.json"), JSON.stringify({
		title: "Package", order: 50, defaultEnabled: true,
		options: [{id: "package", kind: "path", default: "{data}/pkg"}],
		entries: [{type: "copy", source: "{option:package}/site", target: "."}],
	}));
	assert.equal(String((await overlay.serve("css/extra.css")).body), ".pkg {}\n");
});

test("{manager} resolves to the manager folder, directly and through a path option", async () => {
	const {overlay, mods, manager} = await setup();
	await write(path.join(manager, "notes.json"), "{\"from\": \"manager\"}");
	await write(path.join(manager, "customizer/patch-deploy/site/css/shell.css"), ".shell {}\n");
	await write(path.join(mods, "pkg/module.json"), JSON.stringify({
		title: "Package", order: 50, defaultEnabled: true,
		options: [{id: "package", kind: "path", default: "{manager}/customizer/patch-deploy"}],
		entries: [
			{type: "copy", source: "{manager}/notes.json", target: "data/notes.json"},
			{type: "copy", source: "{option:package}/site", target: "."},
		],
	}));
	assert.equal(String((await overlay.serve("data/notes.json")).body), "{\"from\": \"manager\"}");
	assert.equal(String((await overlay.serve("css/shell.css")).body), ".shell {}\n");
});

test("module cache refreshes immediately when module.json or config changes", async () => {
	const {overlay, mods, configPath} = await setup();
	assert.equal(String((await overlay.serve("js/a.js")).body), "const label = \"Ancestries\";\n");

	await write(path.join(mods, "rename/module.json"), JSON.stringify({
		title: "Rename", order: 10, defaultEnabled: true,
		entries: [{type: "patch", target: "js/a.js", patches: [{note: "Label", find: "\"Species\"", replace: "\"Lineages\""}]}],
	}));
	assert.equal(String((await overlay.serve("js/a.js")).body), "const label = \"Lineages\";\n");

	await fs.writeFile(configPath, JSON.stringify({deploy: {modules: {rename: {enabled: false}}}}));
	assert.equal(await overlay.serve("js/a.js"), null);
});
