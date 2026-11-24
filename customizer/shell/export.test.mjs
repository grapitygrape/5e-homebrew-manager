// node --test shell/export.test.mjs
import assert from "node:assert/strict";
import {existsSync, promises as fs} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {makeSite, makeUpstream, write} from "../scripts/fixtures.mjs";
import {patchFiles} from "../scripts/patch.mjs";
import {exportPackage} from "./export.mjs";

const SAMPLE_HOME = `<!doctype html>
<html>
<head><!-- Favicons --></head>
<body>
<div class="ve-flex-col">
	<header><h1>Home</h1><p id="page__subtitle">Sub</p></header>
	<nav></nav>
</div>
</body>
</html>
`;

const makeFixtureRepo = async () => {
	const base = await fs.mkdtemp(path.join(os.tmpdir(), "export-"));
	const repo = path.join(base, "customizer");
	await write(path.join(repo, "shell/tooltips.js"), "// tooltips\n");
	await write(path.join(repo, "shell/omni-complete.js"), "// omni\n");
	await write(path.join(repo, "shell/overrides/index.html"), SAMPLE_HOME);
	await write(path.join(repo, "assets/watercolor-light.webp"), "webp-bytes");
	await write(path.join(base, "data/fonts/majesty-bold.woff2"), "font-bytes");
	const upstreamPath = path.join(repo, "upstream.json");
	const patchPath = path.join(repo, "upstream.patch");
	const outDir = path.join(repo, "patch-deploy");
	const assetSources = {
		"fonts/majesty-bold.woff2": path.join(base, "data/fonts/majesty-bold.woff2"),
		"watercolor-light.webp": path.join(repo, "assets/watercolor-light.webp"),
	};
	return {base, repo, upstreamPath, patchPath, outDir, assetSources};
};

test("export --worktree includes untracked files under js/node/scss", async () => {
	const upstream = await makeUpstream();
	const site = await makeSite(upstream);
	const fx = await makeFixtureRepo();
	await write(fx.upstreamPath, JSON.stringify({commit: upstream.commit, describe: "v2.41.1"}));

	const res = await exportPackage({
		repoRoot: fx.repo,
		site,
		outDir: fx.outDir,
		upstreamPath: fx.upstreamPath,
		patchPath: fx.patchPath,
		assetSources: fx.assetSources,
		bundleCss: async () => "/* shell */\n",
		worktree: true,
		warn: () => {},
	});

	assert.equal(res.sourceMode, "site");
	assert.equal(res.skipped, false);
	const patch = await fs.readFile(path.join(fx.outDir, "reskin.patch"), "utf8");
	assert.deepEqual(patchFiles(patch).sort(), ["js/a.js", "js/new.js", "scss/b.scss"]);
});

test("export without --worktree keeps only committed js/node/scss changes", async () => {
	const upstream = await makeUpstream();
	const site = await makeSite(upstream);
	const fx = await makeFixtureRepo();
	await write(fx.upstreamPath, JSON.stringify({commit: upstream.commit, describe: "v2.41.1"}));
	const warnings = [];

	await exportPackage({
		repoRoot: fx.repo,
		site,
		outDir: fx.outDir,
		upstreamPath: fx.upstreamPath,
		patchPath: fx.patchPath,
		assetSources: fx.assetSources,
		bundleCss: async () => "/* shell */\n",
		worktree: false,
		warn: msg => warnings.push(msg),
	});

	const patch = await fs.readFile(path.join(fx.outDir, "reskin.patch"), "utf8");
	assert.deepEqual(patchFiles(patch), ["js/a.js"]);
	assert.ok(warnings.some(w => w.includes("Uncommitted changes")));
});

test("falls back to upstream.patch automatically when the site checkout is absent", async () => {
	const fx = await makeFixtureRepo();
	await write(fx.upstreamPath, JSON.stringify({commit: "c3a5185c8f3fc8937725fdc4be249eb7120057c7", describe: "v2.41.1"}));
	await write(fx.patchPath, [
		"HBM edits to homebrew-tools-src, built on upstream v2.41.1 (c3a5185)",
		"diff --git a/.gitignore b/.gitignore",
		"--- a/.gitignore",
		"+++ b/.gitignore",
		"@@ -1 +1,2 @@",
		" a",
		"+b",
		"diff --git a/js/app.js b/js/app.js",
		"--- a/js/app.js",
		"+++ b/js/app.js",
		"@@ -1 +1 @@",
		"-old",
		"+new",
		"",
	].join("\n"));

	const warnings = [];
	const res = await exportPackage({
		repoRoot: fx.repo,
		site: path.join(fx.base, "missing-site"),
		outDir: fx.outDir,
		upstreamPath: fx.upstreamPath,
		patchPath: fx.patchPath,
		assetSources: fx.assetSources,
		bundleCss: async () => "/* shell */\n",
		worktree: true,
		warn: msg => warnings.push(msg),
	});

	assert.equal(res.sourceMode, "upstream.patch");
	assert.ok(warnings.some(w => w.includes("falling back")));
	const patch = await fs.readFile(path.join(fx.outDir, "reskin.patch"), "utf8");
	assert.match(patch, /^Reskin exported from upstream\.patch, built on upstream v2\.41\.1 \(c3a5185\)/);
	assert.deepEqual(patchFiles(patch), ["js/app.js"]);
	assert.ok(!patch.includes(".gitignore"));
});

test("includeLicensedFonts=false omits licensed fonts while keeping textures", async () => {
	const fx = await makeFixtureRepo();
	await write(fx.upstreamPath, JSON.stringify({commit: "c3a5185", describe: "v2.41.1"}));
	await write(fx.patchPath, "header\ndiff --git a/js/a.js b/js/a.js\n");

	await exportPackage({
		repoRoot: fx.repo,
		site: path.join(fx.base, "missing"),
		outDir: fx.outDir,
		upstreamPath: fx.upstreamPath,
		patchPath: fx.patchPath,
		assetSources: fx.assetSources,
		bundleCss: async () => "/* shell */\n",
		fromPatch: true,
		includeLicensedFonts: false,
		warn: () => {},
	});

	assert.equal(existsSync(path.join(fx.outDir, "site/fonts/majesty-bold.woff2")), false);
	assert.equal(existsSync(path.join(fx.outDir, "site/watercolor-light.webp")), true);
});

test("second run with unchanged inputs skips all writes via .export-stamp and prunes stale files on change", async () => {
	const fx = await makeFixtureRepo();
	await write(fx.upstreamPath, JSON.stringify({commit: "c3a5185", describe: "v2.41.1"}));
	await write(fx.patchPath, "header\ndiff --git a/js/a.js b/js/a.js\n");

	let css = "/* v1 */\n";
	const opts = {
		repoRoot: fx.repo,
		site: path.join(fx.base, "missing"),
		outDir: fx.outDir,
		upstreamPath: fx.upstreamPath,
		patchPath: fx.patchPath,
		assetSources: fx.assetSources,
		bundleCss: async () => css,
		fromPatch: true,
		warn: () => {},
	};

	const first = await exportPackage(opts);
	assert.equal(first.skipped, false);
	assert.ok(first.written > 0);

	// Plant a stale file that should survive an up-to-date skip, then get pruned once inputs change.
	const stale = path.join(fx.outDir, "site/stale.txt");
	await write(stale, "old");

	const second = await exportPackage(opts);
	assert.equal(second.skipped, true);
	assert.equal(second.written, 0);

	// Change only CSS: only shell.css should be rewritten, and stale.txt should be pruned.
	css = "/* v2 */\n";
	const third = await exportPackage(opts);
	assert.equal(third.skipped, false);
	assert.equal(third.written, 1);
	assert.equal(existsSync(stale), false);
	assert.equal(await fs.readFile(path.join(fx.outDir, "site/css/shell.css"), "utf8"), "/* v2 */\n");
});
