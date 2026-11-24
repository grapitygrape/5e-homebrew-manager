// Packages the shell into patch-deploy/ here for the manager's "Reskin the site" module:
// reskin.patch (our edits to js/, node/ and scss/ against the upstream base in
// upstream.json) and site/ (css/shell.css, js/shell-tooltips.js and js/shell-omni-complete.js,
// the assets and index.html).
// Flags:
//   --worktree           Include uncommitted and untracked edits from the site checkout.
//   --from-patch         Build reskin.patch from committed upstream.patch instead of a site checkout.
//   --no-licensed-fonts  Omit local {data}/fonts assets (for redistributable/container packages).
//   --force              Rewrite outputs even when .export-stamp matches.
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, promises as fs} from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {buildPatch, filterPatchByDirs} from "../scripts/patch.mjs";
import {ASSET_SOURCES, patchPath as defaultPatchPath, repoRoot as defaultRepoRoot, siteRoot, upstreamPath as defaultUpstreamPath} from "../scripts/paths.mjs";
import {adoptShell} from "./adopt-shell.mjs";
import {bundleShellCss} from "./bundle.mjs";

const PATCH_DIRS = ["js", "node", "scss"];
const STAMP_FILE = ".export-stamp";
const LICENSED_FONT_KEYS = new Set([
	"fonts/majesty-bold.woff2",
	"fonts/majesty-black.woff2",
	"hbm/modesto-condensed/modesto-condensed.woff2",
]);

const git = (site, ...args) =>
	execFileSync("git", args, {cwd: site, maxBuffer: 64 * 1024 * 1024}).toString("utf8");

/** Walks a file or directory, returning sorted `{rel, src, size, mtimeMs}` entries. */
const collectFiles = async (srcRoot, siteRel) => {
	const st = await fs.stat(srcRoot);
	if (st.isFile()) return [{rel: siteRel, src: srcRoot, size: st.size, mtimeMs: st.mtimeMs}];
	const out = [];
	const walk = async (dir, prefix) => {
		const entries = (await fs.readdir(dir, {withFileTypes: true}))
			.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			const rel = `${prefix}/${entry.name}`;
			if (entry.isDirectory()) await walk(full, rel);
			else if (entry.isFile()) {
				const fst = await fs.stat(full);
				out.push({rel, src: full, size: fst.size, mtimeMs: fst.mtimeMs});
			}
		}
	};
	await walk(srcRoot, siteRel);
	return out;
};

/** Writes a text file only when missing or its UTF-8 content differs. */
const writeTextIfChanged = async (file, content) => {
	try {
		if (await fs.readFile(file, "utf8") === content) return false;
	} catch { /* missing */ }
	await fs.mkdir(path.dirname(file), {recursive: true});
	await fs.writeFile(file, content, "utf8");
	return true;
};

/** Copies a binary asset only when missing or size/mtime differs. */
const copyFileIfChanged = async (src, dest, size, mtimeMs) => {
	try {
		const st = await fs.stat(dest);
		if (st.size === size && Math.abs(st.mtimeMs - mtimeMs) < 1) return false;
	} catch { /* missing */ }
	await fs.mkdir(path.dirname(dest), {recursive: true});
	await fs.copyFile(src, dest);
	await fs.utimes(dest, new Date(mtimeMs), new Date(mtimeMs)).catch(() => {});
	return true;
};

/** Removes files under `dir` whose relative POSIX path is not in `keep`, then prunes empty dirs. */
const pruneStale = async (dir, keep) => {
	if (!existsSync(dir)) return;
	const walk = async (cur, prefix) => {
		const entries = await fs.readdir(cur, {withFileTypes: true});
		let remaining = 0;
		for (const entry of entries) {
			const full = path.join(cur, entry.name);
			const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				const subCount = await walk(full, rel);
				if (subCount === 0) await fs.rmdir(full).catch(() => {});
				else remaining += subCount;
			} else if (!keep.has(rel)) {
				await fs.rm(full, {force: true});
			} else {
				remaining++;
			}
		}
		return remaining;
	};
	await walk(dir, "");
};

export const exportPackage = async ({
	repoRoot = defaultRepoRoot,
	site = siteRoot(),
	outDir = path.join(repoRoot, "patch-deploy"),
	upstreamPath = defaultUpstreamPath,
	patchPath = defaultPatchPath,
	assetSources = ASSET_SOURCES,
	bundleCss = bundleShellCss,
	worktree = false,
	fromPatch = false,
	includeLicensedFonts = true,
	force = false,
	warn = console.warn,
} = {}) => {
	const siteDir = path.join(outDir, "site");
	const {commit: base, describe} = JSON.parse(await fs.readFile(upstreamPath, "utf8"));

	const hasSiteCheckout = !fromPatch && Boolean(site) && existsSync(path.join(site, ".git"));
	const usePatchFile = fromPatch || !hasSiteCheckout;

	let header;
	let diff;
	let sourceMode;
	if (usePatchFile) {
		sourceMode = "upstream.patch";
		if (!fromPatch) {
			warn(`Site checkout not found at ${site}; falling back to ${path.basename(patchPath)}`);
		}
		const rawPatch = await fs.readFile(patchPath, "utf8");
		diff = filterPatchByDirs(rawPatch, PATCH_DIRS);
		header = `Reskin exported from upstream.patch, built on upstream ${describe} (${base.slice(0, 7)})`;
	} else {
		sourceMode = "site";
		const headShort = git(site, "rev-parse", "--short", "HEAD").trim();
		if (!worktree) {
			const dirty = git(site, "status", "--porcelain", "--", ...PATCH_DIRS)
				.split("\n")
				.filter(Boolean);
			if (dirty.length) {
				warn("Uncommitted changes in js/node/scss left out of reskin.patch (pass --worktree to include them):");
				for (const line of dirty) warn(`  ${line}`);
			}
		}
		header = `Reskin exported from ${path.basename(site)} ${headShort}, built on upstream ${describe} (${base.slice(0, 7)})`;
		diff = buildPatch(site, base, {dirs: PATCH_DIRS, committedOnly: !worktree}).replace(/\r\n/g, "\n");
	}

	const textOutputs = new Map([
		["reskin.patch", `${header}\n${diff}`],
		["site/css/shell.css", await bundleCss()],
		["site/js/shell-tooltips.js", await fs.readFile(path.join(repoRoot, "shell", "tooltips.js"), "utf8")],
		["site/js/shell-omni-complete.js", await fs.readFile(path.join(repoRoot, "shell", "omni-complete.js"), "utf8")],
		["site/index.html", adoptShell(await fs.readFile(path.join(repoRoot, "shell", "overrides", "index.html"), "utf8"), "index.html")],
	]);

	// Gather asset files (missing fonts fall back to Nodesto, so the package stays usable).
	const assets = [];
	const skippedAssets = [];
	for (const [rel, source] of Object.entries(assetSources)) {
		if (!includeLicensedFonts && LICENSED_FONT_KEYS.has(rel)) continue;
		if (!existsSync(source)) {
			skippedAssets.push(rel);
			warn(`Skipped ${rel}: ${source} not found`);
			continue;
		}
		assets.push(...await collectFiles(source, rel));
	}

	const hash = createHash("sha256");
	for (const [rel, content] of textOutputs) {
		hash.update(`T:${rel}\0${content}\0`);
	}
	for (const a of assets) {
		hash.update(`A:${a.rel}\0${a.size}\0${Math.trunc(a.mtimeMs)}\0`);
	}
	const stamp = hash.digest("hex");

	const expected = new Set([
		STAMP_FILE,
		...textOutputs.keys(),
		...assets.map(a => `site/${a.rel}`),
	]);

	const stampPath = path.join(outDir, STAMP_FILE);
	const currentStamp = await fs.readFile(stampPath, "utf8").catch(() => null);
	if (!force && currentStamp?.trim() === stamp) {
		const allPresent = [...expected].every(rel => existsSync(path.join(outDir, rel)));
		if (allPresent) {
			return {header, outDir, sourceMode, skipped: true, written: 0, skippedAssets};
		}
	}

	await fs.mkdir(siteDir, {recursive: true});
	let written = 0;
	for (const [rel, content] of textOutputs) {
		if (await writeTextIfChanged(path.join(outDir, rel), content)) written++;
	}
	for (const a of assets) {
		if (await copyFileIfChanged(a.src, path.join(siteDir, a.rel), a.size, a.mtimeMs)) written++;
	}
	await pruneStale(outDir, expected);
	await fs.writeFile(stampPath, `${stamp}\n`, "utf8");

	return {header, outDir, sourceMode, skipped: false, written, skippedAssets};
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const argv = process.argv.slice(2);
	const res = await exportPackage({
		worktree: argv.includes("--worktree"),
		fromPatch: argv.includes("--from-patch"),
		includeLicensedFonts: !argv.includes("--no-licensed-fonts"),
		force: argv.includes("--force"),
	});
	console.log(
		res.skipped
			? `${res.header}\nUp to date: ${res.outDir}`
			: `${res.header}\nWrote ${res.outDir} (${res.written} file(s) updated)`,
	);
}
