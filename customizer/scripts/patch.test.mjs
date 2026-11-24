// node --test scripts/
import assert from "node:assert/strict";
import test from "node:test";
import {makeSite, makeUpstream, write, git} from "./fixtures.mjs";
import {buildPatch, filterPatchByDirs, findBase, patchFiles} from "./patch.mjs";
import path from "node:path";

const upstream = await makeUpstream();
const site = await makeSite(upstream);

test("the base is the upstream commit, not our HEAD", () => {
	assert.equal(findBase(site).commit, upstream.commit);
});

test("the base stays put when upstream moves on and the site has not rebased", async () => {
	await write(path.join(upstream.upstream, "data/spells.json"), "{\"new\": true}\n");
	git(upstream.upstream, "commit", "-q", "-am", "v2");
	git(site, "fetch", "-q", "upstream");
	assert.equal(findBase(site).commit, upstream.commit);
});

test("committed, uncommitted and untracked edits are all in the patch", () => {
	const files = patchFiles(buildPatch(site, upstream.commit));
	assert.deepEqual(files.sort(), ["js/a.js", "js/new.js", "scss/b.scss"]);
});

test("committedOnly excludes uncommitted and untracked edits", () => {
	const files = patchFiles(buildPatch(site, upstream.commit, {dirs: ["js", "node", "scss"], committedOnly: true}));
	assert.deepEqual(files.sort(), ["js/a.js"]);
});

test("dirs option keeps untracked files under matching source directories", () => {
	const files = patchFiles(buildPatch(site, upstream.commit, {dirs: ["js", "node", "scss"]}));
	assert.deepEqual(files.sort(), ["js/a.js", "js/new.js", "scss/b.scss"]);
});

test("the untracked file is a new-file diff", () => {
	const patch = buildPatch(site, upstream.commit);
	assert.match(patch, /diff --git a\/js\/new\.js b\/js\/new\.js\nnew file mode/);
	assert.match(patch, /\+export const added = true;/);
});

test("generated output, homebrew, assets and the shell stay out", () => {
	const patch = buildPatch(site, upstream.commit);
	for (const rel of ["index.html", "bestiary/index.html", "css/main.css", "homebrew/index.json", "search/index.json", "fonts/majesty-bold.woff2", "shell/new.css"]) {
		assert.ok(!patch.includes(`b/${rel}`), rel);
	}
});

test("filterPatchByDirs keeps only hunks under the requested directories", () => {
	const raw = [
		"HBM edits to homebrew-tools-src, built on upstream v2.41.1 (abcdef1)",
		"diff --git a/.gitignore b/.gitignore",
		"--- a/.gitignore",
		"+++ b/.gitignore",
		"@@ -1 +1,2 @@",
		" a",
		"+b",
		"diff --git a/js/a.js b/js/a.js",
		"--- a/js/a.js",
		"+++ b/js/a.js",
		"@@ -1 +1 @@",
		"-old",
		"+new",
		"diff --git a/scss/b.scss b/scss/b.scss",
		"--- a/scss/b.scss",
		"+++ b/scss/b.scss",
		"@@ -1 +1 @@",
		"-a",
		"+b",
		"",
	].join("\r\n");
	const filtered = filterPatchByDirs(raw, ["js", "node", "scss"]);
	assert.deepEqual(patchFiles(filtered), ["js/a.js", "scss/b.scss"]);
	assert.ok(!filtered.includes(".gitignore"));
	assert.ok(!filtered.includes("\r\n"));
});
