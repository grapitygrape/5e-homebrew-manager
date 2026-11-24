// Points this repo at a site: an upstream homebrew tools checkout beside it. Adopts a folder
// that already is one, or creates it from upstream.json and upstream.patch. Never
// overwrites work in an existing site.
//   npm run setup -- ../../homebrew-tools [--skip-install] [--skip-build]
//   npm run setup        (prompts for the folder, Enter keeps the default)
import {execFileSync, execSync} from "node:child_process";
import {existsSync, promises as fs} from "node:fs";
import path from "node:path";
import {createInterface} from "node:readline/promises";
import {pathToFileURL} from "node:url";
import {buildPatch, findBase, patchFiles} from "./patch.mjs";
import {ASSET_SOURCES, imageRoot, patchPath, repoRoot, siteRoot, upstreamPath, writeLocal} from "./paths.mjs";
import {savePatch} from "./save-patch.mjs";

const git = (cwd, ...args) => execFileSync("git", args, {cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
const tryGit = (cwd, ...args) => {
	try {
		return git(cwd, ...args).trim();
	} catch {
		return null;
	}
};

const isUpstreamCheckout = dir => {
	const top = tryGit(dir, "rev-parse", "--show-toplevel");
	return !!top && path.resolve(top) === path.resolve(dir) && !!tryGit(dir, "rev-parse", "--verify", "-q", "upstream/main");
};

// Splits a patch into one diff per file, so two patches compare file by file.
const byFile = patch => new Map(patch.split(/^(?=diff --git )/m).filter(p => p.startsWith("diff --git ")).map(p => [patchFiles(p)[0], p]));

const differingFiles = (a, b) => {
	const [x, y] = [byFile(a), byFile(b)];
	return [...new Set([...x.keys(), ...y.keys()])].filter(f => x.get(f) !== y.get(f)).sort();
};

const stripHeader = text => text.slice(text.indexOf("diff --git ") === -1 ? text.length : text.indexOf("diff --git "));

const adopt = async ({target, patchPath, upstreamPath, log}) => {
	if (!existsSync(patchPath)) {
		const {base, files} = await savePatch({site: target, patchPath, upstreamPath});
		log(`No upstream.patch yet: saved ${files.length} files from ${target} (upstream ${base.describe}).`);
		return "saved";
	}
	const pinned = JSON.parse(await fs.readFile(upstreamPath, "utf8"));
	const base = findBase(target);
	if (base.commit !== pinned.commit) {
		throw new Error(`${target} is on upstream ${base.describe}, but upstream.json is on ${pinned.describe}. If you rebased, run npm run save-patch; otherwise rebase the site first.`);
	}
	const differ = differingFiles(stripHeader(await fs.readFile(patchPath, "utf8")), buildPatch(target, base.commit));
	if (differ.length) {
		throw new Error(`${target} doesn't match upstream.patch in:\n  ${differ.join("\n  ")}\nRun npm run save-patch to keep the site's version, or change the site to match. Nothing was changed.`);
	}
	log(`Adopted ${target} (upstream ${base.describe}).`);
	return "adopted";
};

const create = async ({target, patchPath, upstreamPath, reference, log}) => {
	const pinned = JSON.parse(await fs.readFile(upstreamPath, "utf8"));
	const ref = reference && existsSync(path.join(reference, ".git")) ? ["--reference-if-able", reference, "--dissociate"] : [];
	log(`Cloning ${pinned.remote} into ${target}${ref.length ? ` (objects from ${reference})` : ""}...`);
	execFileSync("git", ["clone", "-q", ...ref, "-o", "upstream", pinned.remote, target], {stdio: "inherit"});
	git(target, "checkout", "-q", "-b", "hbm", pinned.commit);
	git(target, "apply", "--whitespace=nowarn", patchPath);
	log(`Applied upstream.patch on ${pinned.describe}. The edits are uncommitted; commit them in the site before your first rebase.`);
	return "created";
};

export const setup = async ({target, patchPath, upstreamPath, skipInstall = false, skipBuild = false, reference = imageRoot, log = console.log, saveLocal = writeLocal}) => {
	target = path.resolve(target);
	let mode;
	if (!existsSync(target)) mode = await create({target, patchPath, upstreamPath, reference, log});
	else if (!isUpstreamCheckout(target)) throw new Error(`${target} is not an upstream checkout (no git repo with an upstream/main branch at its root).`);
	else mode = await adopt({target, patchPath, upstreamPath, log});

	if (mode === "created" && !skipInstall) execSync("npm install", {cwd: target, stdio: "inherit"});
	if (mode === "created" && !skipBuild) execSync(`node "${path.join(repoRoot, "shell", "build.mjs")}"`, {cwd: repoRoot, stdio: "inherit", env: {...process.env, HBM_SITE: target}});
	saveLocal(target);
	return {mode};
};

const prompt = async fallback => {
	const rl = createInterface({input: process.stdin, output: process.stdout});
	const answer = (await rl.question(`Site folder [${fallback}]: `)).trim();
	rl.close();
	return answer || fallback;
};

const relFromRepo = abs => path.relative(repoRoot, abs).split(path.sep).join("/") || ".";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = process.argv.slice(2);
	const given = args.find(a => !a.startsWith("--"));
	const fallback = relFromRepo(siteRoot());
	const target = path.resolve(repoRoot, given ?? (process.stdin.isTTY ? await prompt(fallback) : fallback));
	try {
		await setup({
			target,
			patchPath,
			upstreamPath,
			skipInstall: args.includes("--skip-install"),
			skipBuild: args.includes("--skip-build"),
			saveLocal: abs => writeLocal({site: relFromRepo(abs)}),
		});
		console.log(`Site saved in local.json: ${relFromRepo(target)}`);
		const missing = Object.values(ASSET_SOURCES).filter(source => !existsSync(source));
		if (missing.length) console.warn(`Missing (fonts go in the manager's data folder; see its fonts/README.md):\n  ${missing.join("\n  ")}`);
	} catch (e) {
		console.error(e.message);
		process.exitCode = 1;
	}
}
