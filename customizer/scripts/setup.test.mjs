// node --test scripts/
import assert from "node:assert/strict";
import {existsSync, promises as fs} from "node:fs";
import path from "node:path";
import test from "node:test";
import {git, makeSite, makeUpstream, write} from "./fixtures.mjs";
import {setup} from "./setup.mjs";

const quiet = () => {};

const scenario = async () => {
	const upstream = await makeUpstream();
	const site = await makeSite(upstream);
	const files = {
		patchPath: path.join(upstream.base, "upstream.patch"),
		upstreamPath: path.join(upstream.base, "upstream.json"),
	};
	const saved = [];
	const run = target => setup({target, ...files, skipInstall: true, skipBuild: true, reference: null, log: quiet, saveLocal: target => saved.push(target)});
	return {upstream, site, files, saved, run};
};

test("a folder that isn't a git checkout is refused, and nothing is saved", async () => {
	const {upstream, saved, run} = await scenario();
	const plain = path.join(upstream.base, "plain");
	await fs.mkdir(plain);
	await assert.rejects(run(plain), /not an upstream checkout/);
	assert.deepEqual(saved, []);
});

test("a site that adds an ad slot isn't saved", async () => {
	const {site, files, saved, run} = await scenario();
	await write(path.join(site, "js/new.js"), "<div class=\"cancer__anchor\"></div>\n");
	await assert.rejects(run(site), /js\/new\.js/);
	assert.ok(!existsSync(files.patchPath));
	assert.deepEqual(saved, []);
});

test("the first run on an existing site writes the patch and its base", async () => {
	const {upstream, site, files, saved, run} = await scenario();
	assert.equal((await run(site)).mode, "saved");
	const json = JSON.parse(await fs.readFile(files.upstreamPath, "utf8"));
	assert.equal(json.commit, upstream.commit);
	assert.match(await fs.readFile(files.patchPath, "utf8"), /^HBM edits to homebrew-tools-src, built on upstream /);
	assert.deepEqual(saved, [site]);
});

test("a site that matches the patch is adopted", async () => {
	const {site, run} = await scenario();
	await run(site);
	assert.equal((await run(site)).mode, "adopted");
});

test("a site that differs from the patch is refused, listing the files, and left alone", async () => {
	const {site, files, saved, run} = await scenario();
	await run(site);
	const before = await fs.readFile(files.patchPath, "utf8");
	await write(path.join(site, "js/a.js"), "const a = 3;\n");
	await assert.rejects(run(site), /js\/a\.js/);
	assert.equal(await fs.readFile(files.patchPath, "utf8"), before);
	assert.equal(await fs.readFile(path.join(site, "js/a.js"), "utf8"), "const a = 3;\n");
	assert.equal(saved.length, 1);
});

test("a missing folder is created from upstream and the patch", async () => {
	const {upstream, site, files, run} = await scenario();
	await run(site);
	const json = JSON.parse(await fs.readFile(files.upstreamPath, "utf8"));
	await fs.writeFile(files.upstreamPath, JSON.stringify({...json, remote: upstream.upstream}));
	const fresh = path.join(upstream.base, "fresh");
	assert.equal((await run(fresh)).mode, "created");
	assert.equal(git(fresh, "branch", "--show-current").trim(), "hbm");
	assert.equal(await fs.readFile(path.join(fresh, "js/a.js"), "utf8"), "const a = 2;\n");
	assert.equal(await fs.readFile(path.join(fresh, "js/new.js"), "utf8"), "export const added = true;\n");
	assert.ok(existsSync(path.join(fresh, "data/spells.json")));
	assert.equal(git(fresh, "rev-parse", "HEAD").trim(), upstream.commit);
});
