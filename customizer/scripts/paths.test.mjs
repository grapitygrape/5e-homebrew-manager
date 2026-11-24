// node --test scripts/
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {assetFile, assetSources, DEFAULT_SITE, managerRoot, repoRoot, resolveSite, settingsPaths, webRoot} from "./paths.mjs";

const fake = path.resolve("/web/5e-homebrew-manager/customizer");
const defaultSite = path.resolve("/web/homebrew-tools");

test("the environment variable wins", () => {
	const site = resolveSite({env: {HBM_SITE: "/elsewhere/site"}, localJson: {site: "../saved"}, repoRoot: fake, defaultSite});
	assert.equal(site, path.resolve("/elsewhere/site"));
});

test("local.json is used when the variable isn't set, relative to this folder", () => {
	assert.equal(resolveSite({env: {}, localJson: {site: "../../saved"}, repoRoot: fake, defaultSite}), path.resolve("/web/saved"));
});

test("the default is used when neither is set", () => {
	assert.equal(resolveSite({env: {}, localJson: {}, repoRoot: fake, defaultSite}), defaultSite);
});

test("an empty variable doesn't count", () => {
	assert.equal(resolveSite({env: {HBM_SITE: " "}, localJson: {}, repoRoot: fake, defaultSite}), defaultSite);
});

test("the real layout: this folder sits in the manager, which sits in the web folder", () => {
	assert.equal(path.dirname(repoRoot), managerRoot);
	assert.equal(path.dirname(managerRoot), webRoot);
	assert.equal(DEFAULT_SITE, path.join(webRoot, "homebrew-tools"));
});

// The manager can hold its own untracked 5e/ folder; the fallbacks are beside the manager.
test("with no Settings, sibling folders resolve beside the manager, never inside it", () => {
	const {toolsSource} = settingsPaths({});
	for (const dir of [toolsSource, DEFAULT_SITE]) {
		assert.ok(!dir.startsWith(`${managerRoot}${path.sep}`), dir);
		assert.equal(path.dirname(dir), webRoot, dir);
	}
});

const manager = path.resolve("/web/5e-homebrew-manager");
const web = path.resolve("/web");

test("Settings > Repos Tools source is used when set", () => {
	const config = {sourceRepos: {tools: {path: "/data/tools-src"}}, data: {path: "/old/data"}};
	assert.deepEqual(settingsPaths(config, {manager, web}), {toolsSource: path.resolve("/data/tools-src")});
});

test("fonts come from the data folder, and a path inside a folder asset maps into it", () => {
	const data = path.resolve("/appdata/hbm");
	const sources = assetSources(data);
	assert.equal(sources["hbm/modesto-condensed/modesto-condensed.woff2"], path.join(data, "fonts", "modesto-condensed.woff2"));
	assert.equal(sources["fonts/majesty-bold.woff2"], path.join(data, "fonts", "majesty-bold.woff2"));
	assert.equal(assetFile("hbm/nodesto/README.md", sources), path.join(sources["hbm/nodesto"], "README.md"));
	assert.equal(assetFile("js/render.js", sources), null);
});

test("an older config without repos uses the folder above Source data", () => {
	assert.equal(settingsPaths({data: {path: "/old/tools/data"}}, {manager, web}).toolsSource, path.resolve("/old/tools"));
});

test("relative Settings paths resolve from the manager, and blank ones don't count", () => {
	const got = settingsPaths({sourceRepos: {tools: {path: "  "}}, data: {path: "./data-sources/data"}}, {manager, web});
	assert.deepEqual(got, {toolsSource: path.join(manager, "data-sources")});
});
